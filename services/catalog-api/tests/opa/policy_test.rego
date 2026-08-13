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

test_group_snapshot_member_is_allowed if {
    group_input := {
        "subject": {"id": "noemie.rochat", "type": "person"},
        "action": "data.read",
        "resource": {"id": "11111111-1111-4111-8111-111111111111"},
        "endpoint": {"protocol": "http-rest"},
        "context": {"currentDate": "2026-08-12"},
    }
    result := decision with input as group_input
    result.allow
}

test_person_outside_group_snapshot_is_denied if {
    group_input := {
        "subject": {"id": "new.member", "type": "person"},
        "action": "data.read",
        "resource": {"id": "11111111-1111-4111-8111-111111111111"},
        "endpoint": {"protocol": "http-rest"},
        "context": {"currentDate": "2026-08-12"},
    }
    result := decision with input as group_input
    not result.allow
}

test_group_snapshot_is_time_bounded if {
    group_input := {
        "subject": {"id": "noemie.rochat", "type": "person"},
        "action": "data.read",
        "resource": {"id": "11111111-1111-4111-8111-111111111111"},
        "endpoint": {"protocol": "http-rest"},
        "context": {"currentDate": "2027-01-01"},
    }
    result := decision with input as group_input
    not result.allow
}
