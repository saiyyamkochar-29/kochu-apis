declare module 'xbox-webapi' {
  interface XboxWebApiConfig {
    clientId?: string;
    clientSecret?: string;
  }

interface XboxWebApiClient {
    isAuthenticated(): Promise<void>;
    getProvider(name: string): any;
    _authentication: any;
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
    getTitleHistory(): Promise<XboxWebApiTitleHistory>;
}

  declare function XboxWebApiClient(config?: XboxWebApiConfig): XboxWebApiClient;
}