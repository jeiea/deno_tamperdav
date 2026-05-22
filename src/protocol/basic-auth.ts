export type BasicAuthOptions = {
  username?: string;
  password?: string;
};

export function isAuthorized(request: Request, { username, password }: BasicAuthOptions) {
  if (!(username || password)) {
    return true;
  }

  const auth = request.headers.get("authorization");
  const [user, pass] = auth?.match("Basic (.*)")?.[1]?.split(":") ?? [];
  return user == username && pass == password;
}
