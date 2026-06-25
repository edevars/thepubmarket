import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Configuración por defecto de OpenNext para Cloudflare Workers.
// En fases posteriores aquí se habilitan caché incremental (KV/R2/D1),
// revalidación y colas si se necesitan.
export default defineCloudflareConfig()
