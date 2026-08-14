package daca.authz

import rego.v1

default decision := {
  "allow": false,
  "reason": "default deny",
}

decision := {
  "allow": true,
  "reason": "kanton-st-gallen may read the ESTV data product",
} if {
  input.subject.id == "kanton-st-gallen"
  input.action == "data.read"
  input.endpoint.protocol in {"http-rest", "postgresql"}
  product := data.daca.pip.products[input.resource.id]
  product.id == input.resource.id
  product.owner == "ESTV"
  product.slug == "estv-tax-statistics"
}
