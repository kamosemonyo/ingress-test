export class Service {
  name:string;
  replicas:Number;
  propertiesFilePath:string;
  branches:string[];

  constructor(name:string, replicas:Number, propertiesFilePath:string, branches:string[]) {
    this.name = name;
    this.replicas = replicas;
    this.propertiesFilePath = propertiesFilePath;
    this.branches = branches;
  }
}

export class JavaService extends Service {

  constructor(name:string, replicas:Number, propertiesFilePath:string, branches:string[]) {
    super(name, replicas, propertiesFilePath, branches);
  }
}