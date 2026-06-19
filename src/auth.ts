import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowedEmail } from '@/lib/allowlist';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  callbacks: {
    signIn({ user, profile }) {
      const email = profile?.email ?? user?.email;
      return isAllowedEmail(email, process.env.AUTH_ALLOWED_EMAILS);
    },
  },
});
