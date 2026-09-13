/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base do gateway. Permite apontar para outro ambiente sem rebuild do codigo. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
