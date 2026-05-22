export type BasicAuthOptions = {
  username?: string;
  password?: string;
};

export function isAuthorized(request: Request, { username, password }: BasicAuthOptions) {
  if (!(username || password)) {
    return true;
  }

  const auth = request.headers.get("authorization");
  const decoded = decodeBasicCredentials(auth);
  if (!decoded) {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) {
    return false;
  }

  const user = decoded.slice(0, separator);
  const pass = decoded.slice(separator + 1);
  return user === (username ?? "") && pass === (password ?? "");
}

function decodeBasicCredentials(authorization: string | null) {
  const encoded = authorization?.match(/^Basic\s+(.+)$/i)?.[1];
  if (!encoded) {
    return null;
  }

  try {
    return atob(encoded);
  } catch {
    return null;
  }
}
