export type Confidence = 'verified' | 'observed' | 'consensus' | 'unsourced';
export type Medium = 'solid' | 'fluid' | 'power';
export type PortDirection = 'input' | 'output' | 'bidirectional';
export type QuarterTurn = 0 | 90 | 180 | 270;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

export interface PortSpec {
  id: string;
  medium: Medium;
  direction: PortDirection;
  positionM: Vec3;
  normal: Vec3;
  confidence: Confidence;
  sampleCount: number;
  maxDeviationM: number;
}

export interface MachineSpec {
  buildingClass: string;
  name: string;
  hardBoxes: Box3[];
  ports: PortSpec[];
  powerDemandMW: number;
}

export interface MachineOperation {
  recipeId?: string;
  recipeName?: string;
  clockPercent?: number;
  powerShards?: number;
  somersloops?: number;
  outputMultiplier?: number;
  inputRates: Record<string, number>;
  outputRates: Record<string, number>;
  powerDemandMW?: number;
}

export interface Placement {
  id: string;
  spec: MachineSpec;
  positionM: Vec3;
  rotation: QuarterTurn;
  operation?: MachineOperation;
}

/** x/y는 타일의 좌하단, z는 타일 윗면이다. */
export interface FoundationTile {
  id: string;
  xM: number;
  yM: number;
  zM: number;
  sizeM: number;
}

export interface PortReference {
  placementId: string;
  portId: string;
}

export interface TransportRoute {
  id: string;
  from: PortReference;
  to: PortReference;
  medium: Exclude<Medium, 'power'>;
  itemId: string;
  flowPerMinute: number;
  transportClass: string;
  capacityPerMinute: number;
  pathM: Vec3[];
}

export interface RailRoute {
  id: string;
  pathM: Vec3[];
}

export interface PowerSource {
  id: string;
  capacityMW: number;
}

export interface PowerEdge {
  id: string;
  from: string;
  to: string;
}

export interface FactoryPlan {
  schemaVersion: 1;
  id: string;
  foundations: FoundationTile[];
  placements: Placement[];
  transports: TransportRoute[];
  rails?: RailRoute[];
  powerSources: PowerSource[];
  powerEdges: PowerEdge[];
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code:
    | 'EMPTY_PLAN'
    | 'DUPLICATE_ID'
    | 'PORT_DATA_MISSING'
    | 'UNSUPPORTED_PORT'
    | 'FOUNDATION_SUPPORT'
    | 'MACHINE_COLLISION'
    | 'ROUTE_COLLISION'
    | 'ROUTE_CROSSING'
    | 'ROUTE_ENDPOINT'
    | 'ROUTE_SEGMENT_LENGTH'
    | 'ROUTE_TURN_RADIUS'
    | 'ROUTE_INCLINE'
    | 'ROUTE_TURN_INCLINE'
    | 'RAIL_GEOMETRY'
    | 'LIFT_HEIGHT'
    | 'PORT_DIRECTION'
    | 'PORT_MEDIUM'
    | 'TRANSPORT_CAPACITY'
    | 'FLOW_BALANCE'
    | 'POWER_DISCONNECTED'
    | 'POWER_CAPACITY';
  severity: ValidationSeverity;
  subjectIds: string[];
  message: string;
  detail?: Record<string, number | string>;
}

export interface ValidationResult {
  publishable: boolean;
  issues: ValidationIssue[];
}
