import { DEV_VERSION, EKS_NON_PROD_CLUSTER_NAME, EKS_PROD_CLUSTER_NAME, ENV_DEV, ENV_PRE, ENV_PROD, KONG_DEV_TAG, KONG_PRE_TAG, KONG_PROD_TAG, RELEASE_VERSION } from "./constants";

export const toValidConstructName = (id: string) => {
  let str = id.split('_').join('-');

  return str.split('-')
  .map(w => w[0].toUpperCase() + w.substr(1).toLowerCase())
  .join('-');
};

export function getServiceTagVersion (environment:string):string {
  if (environment == ENV_DEV) {
    return DEV_VERSION
  } else {
    return RELEASE_VERSION
  }
}

export function getKongTagVersion (environment:string):string {
  if (environment == ENV_PROD) {
    return KONG_PROD_TAG
  } else if (environment == ENV_PRE) {
    return KONG_PRE_TAG
  } else {
    return KONG_DEV_TAG
  }
}

export function getClusterName (environment:string):string {
  return (environment == ENV_PROD) ? EKS_PROD_CLUSTER_NAME: EKS_NON_PROD_CLUSTER_NAME
}