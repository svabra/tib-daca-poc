package daca.authz

import rego.v1

default decision := {"allow": false, "reason": "default_deny"}

request_timestamp_ns := time.parse_rfc3339_ns(timestamp) if {
    timestamp := object.get(object.get(input, "context", {}), "requestTimestamp", "")
}

valid_grant_time(grant) if {
    not grant.weeklyAvailability
    parts := time.date(request_timestamp_ns)
    request_date := sprintf("%04d-%02d-%02d", parts)
    request_date >= grant.validFrom
    request_date <= grant.validUntil
}

valid_grant_time(grant) if {
    schedule := grant.weeklyAvailability
    parts := time.date([request_timestamp_ns, schedule.timeZone])
    request_date := sprintf("%04d-%02d-%02d", parts)
    request_date >= grant.validFrom
    request_date <= grant.validUntil
    weekday := lower(time.weekday([request_timestamp_ns, schedule.timeZone]))
    weekday in schedule.weekdays
    clock := time.clock([request_timestamp_ns, schedule.timeZone])
    now_seconds := (clock[0] * 3600) + (clock[1] * 60) + clock[2]
    start_parts := split(schedule.startTime, ":")
    start_seconds := (to_number(start_parts[0]) * 3600) + (to_number(start_parts[1]) * 60)
    end_parts := split(schedule.endTime, ":")
    end_seconds := (to_number(end_parts[0]) * 3600) + (to_number(end_parts[1]) * 60)
    now_seconds >= start_seconds
    now_seconds < end_seconds
}

matches_grant(policy, grant) if {
    resource := data.daca.resourcesById[input.resource.id]
    policy.productId == input.resource.id
    grant.subject.id == input.subject.id
    grant.subject.type == object.get(input.subject, "type", "person")
    input.action in grant.actions
    resource.urn in policy.resources.productUrns
    resource.owner in policy.resources.owners
    request_protocol in grant.protocols
    valid_grant_time(grant)
}

matches_group_grant(policy, grant) if {
    resource := data.daca.resourcesById[input.resource.id]
    policy.productId == input.resource.id
    grant.subject.type == "group"
    input.subject.type == "person"
    input.subject.id in grant.groupSnapshot.memberIds
    input.action in grant.actions
    resource.urn in policy.resources.productUrns
    resource.owner in policy.resources.owners
    request_protocol in grant.protocols
    valid_grant_time(grant)
}

matches_legacy(policy) if {
    request_timestamp_ns
    count(object.get(policy, "grants", [])) == 0
    resource := data.daca.resourcesById[input.resource.id]
    policy.productId == input.resource.id
    input.subject.id in policy.subjects.userIds
    input.action in policy.actions
    resource.urn in policy.resources.productUrns
    resource.owner in policy.resources.owners
    request_protocol in policy.protocols
}

request_protocol := "http" if {
    input.endpoint.protocol == "http-rest"
}

request_protocol := "postgresql" if {
    input.endpoint.protocol == "postgresql"
}

explicitly_denied if {
    some policy in data.daca.policies
    policy.effect == "deny"
    some grant in policy.grants
    matches_grant(policy, grant)
}

explicitly_denied if {
    some policy in data.daca.policies
    policy.effect == "deny"
    some grant in policy.grants
    matches_group_grant(policy, grant)
}

explicitly_denied if {
    some policy in data.daca.policies
    policy.effect == "deny"
    matches_legacy(policy)
}

permitted if {
    some policy in data.daca.policies
    policy.effect == "allow"
    some grant in policy.grants
    matches_grant(policy, grant)
}

permitted if {
    some policy in data.daca.policies
    policy.effect == "allow"
    some grant in policy.grants
    matches_group_grant(policy, grant)
}

permitted if {
    some policy in data.daca.policies
    policy.effect == "allow"
    matches_legacy(policy)
}

decision := {"allow": false, "reason": "explicit_deny"} if {
    explicitly_denied
}

decision := {"allow": true, "reason": "policy_allow"} if {
    permitted
    not explicitly_denied
}
