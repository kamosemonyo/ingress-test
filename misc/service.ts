export class Service {
  name:String;
  replicas:Number;
  propertiesFilePath:String;
  branches:String[];

  constructor(name:String, replicas:Number, propertiesFilePath:String, branches:String[]) {
    this.name = name;
    this.replicas = replicas;
    this.propertiesFilePath = propertiesFilePath;
    this.branches = branches;
  }
}

export class JavaService extends Service {

  constructor(name:String, replicas:Number, propertiesFilePath:String, branches:String[]) {
    super(name, replicas, propertiesFilePath, branches);
  }
}