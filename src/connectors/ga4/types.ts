export interface Ga4MetricValue { value: string }
export interface Ga4DimensionValue { value: string }
export interface Ga4Row {
  dimensionValues: Ga4DimensionValue[];
  metricValues: Ga4MetricValue[];
}
export interface Ga4Header { name: string }
export interface Ga4Report {
  dimensionHeaders?: Ga4Header[];
  metricHeaders?: Ga4Header[];
  rows?: Ga4Row[];
}
