import { ENV_PRE, ENV_PROD } from "./constants";

export class Account {
  static forPipeline (env:string = ENV_PRE) {
    if (env !== ENV_PRE && env !== ENV_PROD) {
      env = 'pre';
    }

    if (env == ENV_PROD) {
      return {
        region: 'eu-west-1',
        account: '737245153745',
      };
    }

    return {
      region: 'eu-west-1',
      account: '737245153745',
    };
  }

  static forCluster (env:string = ENV_PRE) {
    if (env !== ENV_PRE && env !== ENV_PROD) {
      env = 'pre';
    }

    if (env == ENV_PROD) {
      return {
        region: 'af-south-1',
        account: '737245153745',
      };
    }

    return {
      region: 'af-south-1',
      account: '737245153745',
    };
  }
}