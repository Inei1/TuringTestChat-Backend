import * as jwt from "jsonwebtoken";

export function generateToken(userObject: { user: string; fingerprint: string}, type: "access" | "refresh") {
  if (type === "access") {
    return jwt.sign({ user: userObject.user, fingerprintHash: userObject.fingerprint }, process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: "15m" })
  } else {
    return jwt.sign({ user: userObject.user, fingerprintHash: userObject.fingerprint }, process.env.REFRESH_TOKEN_SECRET!,
      { expiresIn: "2h" });
  }
}
