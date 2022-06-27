
export class Kubectl {

  static login (clusterName:string, region?:string) {
    const clusterRegion = (region == undefined) ? 'af-south-1': region
    return `aws eks update-kubeconfig --name ${clusterName} --region ${clusterRegion}`
  }

  static applyFolder (folder:string) {
    return `kubectl apply -f ${folder}`
  }
}