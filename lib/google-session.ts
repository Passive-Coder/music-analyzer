export type GoogleSession = {
  email: string;
  name: string | null;
  picture: string | null;
};

export const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
  "183510826652-7k0fk9vbqbonm1v15dm05k7jfbpdn3ao.apps.googleusercontent.com";
