package daca.authz

import rego.v1

test_st_gallen_is_allowed if {
  decision.allow with input as {
    "subject": {"id": "kanton-st-gallen"},
    "action": "data.read",
    "resource": {"id": "11111111-1111-4111-8111-111111111111"},
    "endpoint": {"protocol": "http-rest"},
  } with data.daca.pip.products as {
    "11111111-1111-4111-8111-111111111111": {
      "id": "11111111-1111-4111-8111-111111111111",
      "owner": "ESTV",
      "slug": "estv-tax-statistics",
    },
  }
}

test_other_canton_is_denied if {
  not decision.allow with input as {
    "subject": {"id": "kanton-bern"},
    "action": "data.read",
    "resource": {"id": "11111111-1111-4111-8111-111111111111"},
    "endpoint": {"protocol": "http-rest"},
  } with data.daca.pip.products as {
    "11111111-1111-4111-8111-111111111111": {
      "id": "11111111-1111-4111-8111-111111111111",
      "owner": "ESTV",
      "slug": "estv-tax-statistics",
    },
  }
}

test_wrong_owner_is_denied if {
  not decision.allow with input as {
    "subject": {"id": "kanton-st-gallen"},
    "action": "data.read",
    "resource": {"id": "11111111-1111-4111-8111-111111111111"},
    "endpoint": {"protocol": "postgresql"},
  } with data.daca.pip.products as {
    "11111111-1111-4111-8111-111111111111": {
      "id": "11111111-1111-4111-8111-111111111111",
      "owner": "OTHER",
      "slug": "estv-tax-statistics",
    },
  }
}
