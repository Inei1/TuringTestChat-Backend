const getFingerPrintCookie = () => {
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    return "Fgp";
  } else {
    return "__Secure-Fgp";
  }
}

function getRefreshCookie() {
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    return "Refresh";
  } else {
    return "__Secure-Refresh";
  }
}

export class Constants {
  static readonly AUTHORIZATION_AUTH_TYPE = "Authorization";
  static readonly AUTHENTICATION_AUTH_TYPE = "Authentication";
  static readonly UNKNOWN_AUTH_TYPE = "Unknown";
  static readonly SUCCESS_AUTH_TYPE = "Success";

  static readonly UNKNOWN_ERROR_MESSAGE = "An unknown error has occurred.";
  static readonly FINGERPRINT_COOKIE = getFingerPrintCookie();
  static readonly REFRESH_COOKIE = getRefreshCookie();
}
