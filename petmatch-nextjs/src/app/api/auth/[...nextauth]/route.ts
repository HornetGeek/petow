import NextAuth from 'next-auth/next'
import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || 'dummy-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy-secret',
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID || 'dummy-id',
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || 'dummy-secret',
    })
  ],
  secret: process.env.NEXTAUTH_SECRET || 'your-fallback-secret-key-change-in-production',
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).id = token.id
      }
      return session
    },
  },
  pages: {
    signIn: '/auth',
    error: '/auth',
  },
})

export { handler as GET, handler as POST } 