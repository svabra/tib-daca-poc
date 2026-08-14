package daca.authz

import rego.v1

estv_input(user, product, protocol) := {
    "subject": {"id": user},
    "action": "data.read",
    "resource": {"id": product, "owner": "caller-controlled-forgery"},
    "endpoint": {"protocol": protocol},
    "context": {"requestTimestamp": "2026-08-12T10:00:00Z"},
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
        "context": {"requestTimestamp": "2026-08-12T10:00:00Z"},
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
        "context": {"requestTimestamp": "2026-08-12T10:00:00Z"},
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
        "context": {"requestTimestamp": "2027-01-01T10:00:00Z"},
    }
    result := decision with input as group_input
    not result.allow
}

journey_input(timestamp) := {
    "subject": {"id": "thomas.kriegli", "type": "person"},
    "action": "data.read",
    "resource": {"id": "22222222-2222-4222-8222-222222222222"},
    "endpoint": {"protocol": "http-rest"},
    "context": {"requestTimestamp": timestamp},
}

test_weekly_window_denies_0659_summer if {
    result := decision with input as journey_input("2026-08-13T04:59:00Z")
    not result.allow
}

test_weekly_window_allows_0700_summer if {
    result := decision with input as journey_input("2026-08-13T05:00:00Z")
    result.allow
}

test_weekly_window_allows_185959_summer if {
    result := decision with input as journey_input("2026-08-13T16:59:59Z")
    result.allow
}

test_weekly_window_denies_1900_summer if {
    result := decision with input as journey_input("2026-08-13T17:00:00Z")
    not result.allow
}

test_weekly_window_denies_weekend if {
    result := decision with input as journey_input("2026-08-15T10:00:00Z")
    not result.allow
}

test_weekly_window_honours_winter_offset if {
    result := decision with input as journey_input("2026-12-14T06:00:00Z")
    result.allow
}

test_weekly_window_missing_timestamp_fails_closed if {
    no_time := object.remove(journey_input("2026-08-13T05:00:00Z"), ["context"])
    result := decision with input as no_time
    not result.allow
}

test_weekly_window_invalid_timestamp_fails_closed if {
    result := decision with input as journey_input("not-a-timestamp")
    not result.allow
}
