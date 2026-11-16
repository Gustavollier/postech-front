// Teste de ponta a ponta do painel, pela interface, contra um ambiente real.
//
// Percorre o que uma pessoa faria: a equipe cadastra cliente, veículo, peça e
// funcionário, abre a ordem e registra o diagnóstico; o cliente entra com o CPF
// e aprova o orçamento; a equipe finaliza. Depois repete até a rejeição, para
// cobrir a compensação da saga.
//
// Não roda na pipeline: precisa do ambiente no ar e de uma credencial de
// gerente, e cria dados de verdade. Uso, com o `npm run dev` de pé:
//
//   E2E_CPF=11144477735 E2E_SENHA='...' node e2e/fluxo.mjs
//
// Variáveis: E2E_BASE (padrão http://localhost:5173/postech-front),
// E2E_API (padrão o APIM), E2E_SHOTS (pasta para capturas; sem ela, não tira).
// Requer o pacote `playwright` instalado na máquina (não é dependência do
// projeto, para o `npm ci` do deploy continuar leve).
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173/postech-front';
const API = process.env.E2E_API ?? 'https://pos-tech-fiap-apim.azure-api.net';
const CPF = process.env.E2E_CPF;
const SENHA = process.env.E2E_SENHA;
const SHOTS = process.env.E2E_SHOTS;
if (!CPF || !SENHA) {
  console.error('Defina E2E_CPF e E2E_SENHA (um funcionário com cargo Gerente).');
  process.exit(2);
}

/** CPF válido aleatório: cada execução cadastra gente nova. */
function cpfNovo() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (base) => {
    const soma = base.reduce((s, d, i) => s + d * (base.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(n);
  const d2 = dv([...n, d1]);
  return [...n, d1, d2].join('');
}
const sufixo = Date.now().toString(36).toUpperCase();
const letras = () => Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
const dados = {
  cliente: { nome: `Cliente E2E ${sufixo}`, cpf: cpfNovo(), email: `e2e.${sufixo.toLowerCase()}@oficina.test` },
  placa: `${letras()}${Math.floor(Math.random() * 10)}${letras()[0]}${Math.floor(10 + Math.random() * 89)}`,
  peca: `Pastilha E2E ${sufixo}`,
  funcionario: { nome: `Mecânico E2E ${sufixo}`, cpf: cpfNovo(), senha: `E2e!${sufixo}aa1` },
};

const falhas = [];
const ruido = [];
let pagina;
let n = 0;

let interromper = false;
async function passo(nome, fn) {
  n += 1;
  if (interromper) return;
  const rotulo = `${String(n).padStart(2, '0')} ${nome}`;
  try {
    await fn();
    console.log(`  ok   ${rotulo}`);
  } catch (e) {
    falhas.push(rotulo);
    console.log(`  FALHA ${rotulo}\n        ${String(e.message).split('\n').slice(0, 4).join('\n        ')}`);
    interromper = Boolean(process.env.E2E_PARAR);
  }
  if (SHOTS) await pagina.screenshot({ path: `${SHOTS}/${rotulo.replace(/[^\w]+/g, '-')}.png`, fullPage: true }).catch(() => {});
}

const ir = (rota) => pagina.goto(`${BASE}/#${rota}`);
const ver = (texto, opcoes = {}) => pagina.getByText(texto, opcoes).first().waitFor({ timeout: opcoes.timeout ?? 15000 });
// O rótulo é o <span class="label"> dentro do <label>; a dica do campo entra no
// nome acessível, então casar pelo nome inteiro falharia nos campos com dica.
const campoEm = (raiz, rotulo) =>
  raiz
    .locator('label')
    .filter({ has: pagina.locator('span.label').getByText(rotulo, { exact: true }) })
    .locator('input, select')
    .first();
const campo = (rotulo) => campoEm(pagina.getByRole('dialog'), rotulo);
const noModal = (nome) => pagina.getByRole('dialog').getByRole('button', { name: nome, exact: true });

async function entrarEquipe(cpf, senha) {
  await ir('/entrar');
  await pagina.getByRole('button', { name: 'Sou da equipe' }).click();
  await pagina.locator('#cpf').fill(cpf);
  await pagina.locator('#senha').fill(senha);
  await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();
  await pagina.getByRole('heading', { name: 'Painel', exact: true }).waitFor();
}
async function entrarCliente(cpf) {
  await ir('/entrar');
  await pagina.getByRole('button', { name: 'Sou cliente' }).click();
  await pagina.locator('#cpf').fill(cpf);
  await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();
  await pagina.getByRole('heading', { name: 'Meus veículos' }).waitFor();
}
async function sair() {
  await pagina.getByRole('button', { name: /Encerrar sessão|Sair/ }).first().click();
  await pagina.getByRole('heading', { name: 'Entrar no painel' }).waitFor();
}

/** Abre uma ordem para o cliente do teste e devolve o número dela. */
async function abrirOrdem() {
  await ir('/ordens');
  await pagina.getByRole('button', { name: '+ Nova ordem' }).waitFor();
  await pagina.waitForTimeout(1500);
  const links = await pagina.locator('a[href*="/ordens/"]').evaluateAll((as) => as.map((a) => Number(a.getAttribute('href').split('/').pop())));
  const antes = Math.max(0, ...links);
  await pagina.getByRole('button', { name: '+ Nova ordem' }).click();
  const selects = pagina.getByRole('dialog').locator('select');
  await selects.nth(0).selectOption({ label: dados.cliente.nome });
  await pagina.waitForFunction(() => document.querySelectorAll('[role=dialog] select')[1].options.length > 1);
  await selects.nth(1).selectOption({ index: 1 });
  await noModal('Abrir ordem').click();
  await ver('Ordem de serviço aberta.');
  // A lista vem da mais nova para a mais antiga; espera a nova chegar ao topo,
  // senão a segunda ordem do teste leria o número da primeira.
  const idDoTopo = async () => {
    const href = await pagina.locator('a[href*="/ordens/"]').first().getAttribute('href');
    return Number(href.split('/').pop());
  };
  for (let t = 0; t < 30; t += 1) {
    const id = await idDoTopo();
    if (id > antes) return id;
    await pagina.waitForTimeout(500);
  }
  throw new Error('a ordem nova não apareceu no topo da lista');
}

async function diagnosticar(id, comPeca) {
  await ir(`/ordens/${id}`);
  await pagina.getByRole('button', { name: 'Registrar diagnóstico' }).click();
  if (comPeca) {
    await noModal('+ Adicionar item').click();
    const itens = pagina.getByRole('dialog').locator('form > div.rounded-lg');
    await itens.nth(1).locator('select').first().selectOption('Peca');
    const seletor = itens.nth(1).locator('select').nth(1);
    await seletor.locator('option', { hasText: dados.peca }).waitFor({ state: 'attached' });
    await seletor.selectOption(await seletor.locator('option', { hasText: dados.peca }).getAttribute('value'));
    await campoEm(itens.nth(1), 'Quantidade').fill('2');
  }
  await noModal('Registrar diagnóstico').click();
  await ver('Diagnóstico registrado', { timeout: 20000 });
  // O orçamento chega pela fila: a tela precisa mostrá-lo sozinha.
  await pagina.getByRole('button', { name: /Aprovar pelo cliente/ }).waitFor({ timeout: 45000 });
  await ver('Troca de óleo');
}

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
pagina = await contexto.newPage();
pagina.on('pageerror', (e) => ruido.push(`erro de script: ${e.message}`));
pagina.on('response', (r) => {
  // 404 de orçamento é estado normal de ordem recém-aberta.
  if (r.url().startsWith(API) && r.status() >= 400 && !(r.status() === 404 && r.url().includes('/orcamentos/os/')))
    ruido.push(`${r.status()} ${r.request().method()} ${r.url().replace(API, '')}`);
});

console.log(`Painel: ${BASE}\nAPI:    ${API}\n`);
let ordem, ordemRejeitada;

await passo('equipe entra e vê o próprio nome', async () => {
  await entrarEquipe(CPF, SENHA);
  const nome = await pagina.locator('aside a[href$="/conta"] p').first().textContent();
  if (!nome || nome.trim() === 'Funcionário') throw new Error(`nome do usuário veio genérico: "${nome}"`);
});

await passo('cadastra cliente', async () => {
  await ir('/clientes');
  await pagina.getByRole('button', { name: '+ Novo cliente' }).click();
  await campo('Nome completo').fill(dados.cliente.nome);
  await campo('CPF').fill(dados.cliente.cpf);
  await campo('Telefone').fill('11988887777');
  await campo('E-mail').fill(dados.cliente.email);
  await noModal('Cadastrar').click();
  await ver('Cliente cadastrado.');
  await ver(dados.cliente.nome);
});

await passo('cadastra veículo do cliente', async () => {
  const cartao = pagina.locator('article', { hasText: dados.cliente.nome });
  await cartao.getByRole('button', { name: '+ Veículo' }).click();
  await campo('Marca').fill('Fiat');
  await campo('Modelo').fill('Argo');
  await campo('Placa').fill(dados.placa);
  await campo('Cor').fill('Branco');
  await campo('Ano').fill('2023');
  await campo('Km').fill('15000');
  await noModal('Cadastrar').click();
  await ver('Veículo cadastrado.');
  await cartao.getByRole('button', { name: 'Ficha e veículos' }).click();
  await pagina.getByRole('dialog').getByText(dados.placa).waitFor();
  await pagina.keyboard.press('Escape');
});

await passo('cadastra peça com estoque', async () => {
  await ir('/pecas');
  await pagina.getByRole('button', { name: '+ Nova peça' }).click();
  await campo('Nome').fill(dados.peca);
  await campo('Marca').fill('Cobreq');
  await campo('Código').fill(`E2E-${sufixo}`);
  await campo('Preço (R$)').fill('89.90');
  await campo('Estoque inicial').fill('10');
  await noModal('Cadastrar').click();
  await ver(dados.peca);
});

await passo('cadastra funcionário', async () => {
  await ir('/equipe');
  await pagina.getByRole('button', { name: '+ Novo funcionário' }).click();
  await campo('Nome').fill(dados.funcionario.nome);
  await campo('CPF').fill(dados.funcionario.cpf);
  await campo('Contato').fill('11977776666');
  await campo('Valor/hora (R$)').fill('85');
  await campo('Senha').fill(dados.funcionario.senha);
  await campo('Confirmar senha').fill(dados.funcionario.senha);
  await noModal('Cadastrar').click();
  await ver(dados.funcionario.nome);
});

await passo('abre ordem de serviço', async () => {
  ordem = await abrirOrdem();
});

await passo('registra diagnóstico com mão de obra e peça; orçamento aparece sozinho', async () => {
  await diagnosticar(ordem, true);
  await ver(dados.peca);
  await ver('R$ 300,30'); // 120,50 + 2 × 89,90
});

await passo('peça fica reservada no estoque', async () => {
  await ir('/pecas');
  const linha = pagina.locator('tr', { hasText: dados.peca });
  await linha.getByText(/2 reservada/).waitFor();
});

await passo('cliente entra, vê só a própria ordem e aprova', async () => {
  await sair();
  await entrarCliente(dados.cliente.cpf);
  await ir('/ordens');
  await pagina.locator(`a[href$="/ordens/${ordem}"]`).waitFor();
  const quantas = await pagina.locator('a[href*="/ordens/"]').count();
  if (quantas !== 1) throw new Error(`o cliente vê ${quantas} ordens, deveria ver 1`);
  await ir(`/ordens/${ordem}`);
  await pagina.getByRole('button', { name: 'Aprovar e pagar' }).click();
  await ver('Orçamento aprovado', { timeout: 30000 });
  await pagina.getByRole('link', { name: /Pagar com Pix/ }).waitFor({ timeout: 30000 });
});

await passo('pagamento confirmado leva a ordem para execução', async () => {
  // Com o webhook configurado, o Mercado Pago avisa sozinho. Sem ele, o teste
  // faz o que a coleção do Postman faz: entrega a notificação à rota pública.
  // O Billing não confia nela — consulta o pedido no adquirente antes de agir.
  const chegou = () => pagina.getByText('Pagamento confirmado').first().waitFor({ timeout: 20000 });
  try {
    await chegou();
  } catch {
    const token = await pagina.evaluate(() => JSON.parse(localStorage.getItem('postech.sessao')).token);
    const orc = await (await fetch(`${API}/billing/api/v1/orcamentos/os/${ordem}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    await fetch(`${API}/billing/api/v1/pagamentos/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'order', data: { id: orc.referenciaExterna } }),
    });
    console.log('        (webhook entregue pelo teste)');
    await pagina.getByText('Pagamento confirmado').first().waitFor({ timeout: 45000 });
  }
  if (await pagina.getByRole('link', { name: /Pagar com Pix/ }).count()) throw new Error('o botão do Pix continua depois de pago');
});

await passo('equipe finaliza a execução e a saga conclui', async () => {
  await sair();
  await entrarEquipe(CPF, SENHA);
  await ir(`/ordens/${ordem}`);
  await pagina.getByRole('button', { name: 'Finalizar execução' }).click();
  await ver('Execução finalizada.', { timeout: 30000 });
  await ver('Concluída', { exact: true, timeout: 45000 });
});

await passo('estoque baixa as peças usadas', async () => {
  await ir('/pecas');
  const linha = pagina.locator('tr', { hasText: dados.peca });
  await linha.getByText('8', { exact: true }).waitFor();
});

await passo('rejeição do orçamento cancela a ordem (compensação)', async () => {
  ordemRejeitada = await abrirOrdem();
  await diagnosticar(ordemRejeitada, false);
  await pagina.getByRole('button', { name: 'Rejeitar pelo cliente' }).click();
  await campo('Motivo').fill('Achou caro');
  await noModal('Rejeitar orçamento').click();
  await ver('Cancelada', { exact: true, timeout: 45000 });
  await ver('Achou caro');
});

await passo('lista e painel mostram a ordem cancelada como cancelada', async () => {
  await ir('/ordens');
  await pagina.locator(`a[href$="/ordens/${ordemRejeitada}"]`).getByText('Cancelada').waitFor();
  await pagina.locator(`a[href$="/ordens/${ordem}"]`).getByText('Finalizada').waitFor();
  await pagina.getByPlaceholder(/Buscar/).fill(dados.placa);
  await pagina.locator(`a[href$="/ordens/${ordem}"]`).waitFor();
  await ir('/');
  await pagina.locator(`a[href$="/ordens/${ordemRejeitada}"]`).getByText('Cancelada').waitFor();
});

await passo('funcionário novo entra com a própria senha e não vê ações de gerente', async () => {
  await sair();
  await entrarEquipe(dados.funcionario.cpf, dados.funcionario.senha);
  await ver(dados.funcionario.nome);
  await ir('/clientes');
  await ver(dados.cliente.nome);
  if (await pagina.getByRole('button', { name: 'Desativar' }).count()) throw new Error('mecânico vê o botão Desativar');
});

await passo('tela de demonstração executa o fluxo inteiro', async () => {
  await sair();
  await entrarEquipe(CPF, SENHA);
  await ir('/demonstracao');
  await pagina.getByRole('button', { name: 'Iniciar demonstração' }).click();
  // Cada botão acende sozinho quando a saga chega no passo dele; o último
  // depende do webhook do Mercado Pago confirmar o pagamento.
  for (let i = 0; i < 6; i += 1) {
    const botao = pagina.getByRole('button', { name: 'Executar', exact: true }).nth(i);
    for (let t = 0; t < 90 && (await botao.isDisabled()); t += 1) await pagina.waitForTimeout(1000);
    await botao.click();
    await pagina.waitForTimeout(800);
  }
  await pagina.locator('aside').getByText('Concluída', { exact: true }).waitFor({ timeout: 45000 });
  if (await pagina.getByRole('alert').count()) throw new Error(`a tela mostrou erro: ${await pagina.getByRole('alert').first().textContent()}`);
});

await navegador.close();

console.log(`\nDados criados: ${JSON.stringify({ cliente: dados.cliente.cpf, placa: dados.placa, ordem, ordemRejeitada })}`);
if (ruido.length) console.log(`\nRespostas de erro e exceções vistas (${ruido.length}):\n  ${[...new Set(ruido)].join('\n  ')}`);
console.log(falhas.length ? `\n${falhas.length} passo(s) falharam:\n  ${falhas.join('\n  ')}` : `\nTodos os ${n} passos passaram.`);
process.exit(falhas.length ? 1 : 0);
