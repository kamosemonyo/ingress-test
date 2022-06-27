
export class Kubectl {

  static login () {
    return 'aws eks update-kubeconfig --name non-prod --region af-south-1'
  }

  static applyFolder (folder:string) {
    return `kubectl apply -f ${folder}`
  }
}