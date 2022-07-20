export interface K8sDeployProps {
    environment:string,
    repositoryName:string,
    account:string,
    propertiesFilePath:string,
    host?:string,
    replicas?:Number
    githubOrgName:string,
    dockerBuildArg?:any
}

