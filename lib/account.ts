import { ACCOUNT_PRE, ACCOUNT_PROD, ECR_REGION, EKS_REGION, ENV_PRE, ENV_PROD, PIPELINE_REGION } from "./constants";

export class Account {
  

  static forPipeline (env:string = ENV_PRE) {
    if (env !== ENV_PRE && env !== ENV_PROD) {
      env = 'pre';
    }

    if (env == ENV_PROD) {
      return {
        region: PIPELINE_REGION,
        account: ACCOUNT_PROD,
      };
    }

    return {
      region: PIPELINE_REGION,
      account: ACCOUNT_PRE,
    };
  }

  static forCluster (env:string = ENV_PRE) {
    if (env !== ENV_PRE && env !== ENV_PROD) {
      env = 'pre';
    }

    if (env == ENV_PROD) {
      return {
        region: EKS_REGION,
        account: ACCOUNT_PROD,
      };
    }

    return {
      region: EKS_REGION,
      account: ACCOUNT_PRE,
    };
  }

  static forImages (env:string = ENV_PRE) {
    if (env !== ENV_PRE && env !== ENV_PROD) {
      env = 'pre';
    }

    if (env == ENV_PROD) {
      return {
        region: ECR_REGION,
        account: ACCOUNT_PROD,
      };
    }

    return {
      region: ECR_REGION,
      account: ACCOUNT_PRE,
    };
  }
}