/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  transpilePackages: ['@googlemaps/js-api-loader', 'leaflet', 'react-leaflet'],
}

module.exports = nextConfig 