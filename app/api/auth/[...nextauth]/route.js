import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { neon } from '@neondatabase/serverless';

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  debug: process.env.NODE_ENV === 'development',
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      try {
        const sql = neon(process.env.DATABASE_URL);
        await sql`
          INSERT INTO users (email, name, updated_at)
          VALUES (${user.email.toLowerCase()}, ${user.name || null}, NOW())
          ON CONFLICT (email) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, users.name),
            updated_at = NOW()
        `;
      } catch (_) {}
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email;
        session.user.name = token.name;
        session.user.image = token.picture;
      }
      return session;
    },
  },
  pages: { signIn: '/' },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
