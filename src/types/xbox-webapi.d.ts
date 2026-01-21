declare module 'xbox-webapi' {
  interface XboxWebApiConfig {
    clientId?: string;
    clientSecret?: string;
  }

  interface XboxWebApiClient {
    authenticate(refreshToken: string): Promise<void>;
    getProvider(name: string): any;
  }

  interface XboxWebApiTitleHistory {
    titles?: XboxWebApiTitle[];
  }

  interface XboxWebApiTitle {
    name?: string;
    images?: XboxWebApiImage[];
  }

  interface XboxWebApiImage {
    url?: string;
    type?: string;
  }

  interface XboxWebApiProvider {
    getTitleHistory(xuid: string): Promise<XboxWebApiTitleHistory>;
  }

  function XboxWebApiClient(config?: XboxWebApiConfig): XboxWebApiClient;
}