package didaca.authz

import rego.v1

estv_input(user, product, protocol) := {
    "subject": {"id": user},
    "action": "data.read",
    "resource": {"id": product, "owner": "caller-controlled-forgery"},
    "endpoint": {"protocol": protocol},
}

test_kanton_st_gallen_http_is_allowed if {
    result := decision with input as estv_input(
        "kanton-st-gallen",
        "11111111-1111-4111-8111-111111111111",
        "http-rest",
    )
    result == {"allow": true, "reason": "policy_allow"}
}

test_kanton_st_gallen_postgresql_is_allowed if {
    result := decision with input as estv_input(
        "kanton-st-gallen",
        "11111111-1111-4111-8111-111111111111",
        "postgresql",
    )
    result.allow
}

test_other_user_is_denied if {
    result := decision with input as estv_input(
        "kanton-bern",
        "11111111-1111-4111-8111-111111111111",
        "http-rest",
    )
    not result.allow
}

test_unknown_product_is_denied if {
    result := decision with input as estv_input(
        "kanton-st-gallen",
        "99999999-9999-4999-8999-999999999999",
        "http-rest",
    )
    not result.allow
}

