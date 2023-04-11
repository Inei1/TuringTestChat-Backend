export interface XYCoord {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface EquationQuantity {
  equation: string;
  quantity: number;
}

export interface Element {
  name: string;
  uiType: string;
  coords: XYCoord | null;
  index: number;
  buttonVariant: string;
  textColor: string;
  backgroundColor: string;
  highlightColor: string;
  borderColor: string;
  costEquation: EquationQuantity;
  resourceModifyEquation: EquationQuantity;
  fontSize: number;
  componentSize: number;
  interval: number;
  size: Size;
  resourceToModify: string;
  resourceToReset: string;
  resourceToIncrease: string;
  buildingToModify: string;
  cost: number;
  baseCost: number;
}

export interface Resource {
  name: string;
  quantity: number;
  modifierEquation: EquationQuantity;
  clickerEquation: EquationQuantity;
}

export interface Building {
  name: string;
  quantity: number;
  interval: number;
  intervalId: number;
  resource: string;
  increasePerInterval: number;
  upgradeEquation: EquationQuantity;
}

export interface Clicker {
  name: string;
  clickerEquation: EquationQuantity;
}

export interface EditorGame {
  name: string;
  id: string;
  defaultElements: Element[];
  defaultResources: Resource[];
  defaultBuildings: Building[];
  defaultClickers: Clicker[];
}

export interface PlayedGame {
  game: EditorGame;
  resources: Resource[];
  buildings: Building[];
  clickers: Clicker[];
}

export interface UserElements {
  user: string;
  password: string;
  email: string;
  editorGames: EditorGame[];
  playedGames: PlayedGame[];
}