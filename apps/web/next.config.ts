import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {}

// Habilita los bindings de Cloudflare (D1, KV, R2) durante `next dev`.
initOpenNextCloudflareForDev()

export default withNextIntl(nextConfig)
