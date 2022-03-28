import { PRE_ENV, PROD_ENV } from "./constants";

export class Account {
  static forPipeline (env:string = PRE_ENV) {
    if (env !== PRE_ENV && env !== PROD_ENV) {
      env = 'pre';
    }

    if (env == PROD_ENV) {
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

  static forCluster (env:string = PRE_ENV) {
    if (env !== PRE_ENV && env !== PROD_ENV) {
      env = 'pre';
    }

    if (env == PROD_ENV) {
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