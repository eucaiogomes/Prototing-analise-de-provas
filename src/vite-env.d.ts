/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Código combinado que libera o envio. Vai no bundle — barra abuso casual, não um atacante. */
  readonly VITE_CODIGO_ENVIO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
