package didaca.authz

import rego.v1

default decision := {"allow": false, "reason": "default_deny"}

matches_grant(policy, grant) if {
    resource := data.didaca.resourcesById[input.resource.id]
    policy.productId == input.resource.id
    grant.subject.id == input.subject.id
    grant.subject.type == object.get(input.subject, "type", "person")
    input.action in grant.actions
    resource.urn in policy.resources.productUrns
    resource.owner in policy.resources.owners
    request_protocol in grant.protocols
    request_date := object.get(object.get(input, "context", {}), "currentDate", "1970-01-01")
    request_date >= grant.validFrom
    request_date <= grant.validUntil
}

matches_group_grant(policy, grant) if {
    resource := data.didaca.resourcesById[input.resource.id]
    policy.productId == input.resource.id
    grant.subject.type == "group"
    input.subject.type == "person"
    input.subject.id in grant.groupSnapshot.memberIds
    input.action in grant.actions
    resource.urn in policy.resources.productUrns
    resource.owner in policy.resources.owners
    request_protocol in grant.protocols
    request_date := object.get(object.get(input, "context", {}), "currentDate", "1970-01-01")
    request_date >= grant.validFrom
    request_date <= grant.validUntil
}

matches_legacy(policy) if {
    count(object.get(policy, "grants", [])) == 0
    resource := data.didaca.resourcesById[input.resource.id]
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
    some policy in data.didaca.policies
    policy.effect == "deny"
    some grant in policy.grants
    matches_grant(policy, grant)
}

explicitly_denied if {
    some policy in data.didaca.policies
    policy.effect == "deny"
    some grant in policy.grants
    matches_group_grant(policy, grant)
}

explicitly_denied if {
    some policy in data.didaca.policies
    policy.effect == "deny"
    matches_legacy(policy)
}

permitted if {
    some policy in data.didaca.policies
    policy.effect == "allow"
    some grant in policy.grants
    matches_grant(policy, grant)
}

permitted if {
    some policy in data.didaca.policies
    policy.effect == "allow"
    some grant in policy.grants
    matches_group_grant(policy, grant)
}

permitted if {
    some policy in data.didaca.policies
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
