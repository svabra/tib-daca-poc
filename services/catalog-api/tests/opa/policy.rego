package didaca.authz

import rego.v1

default decision := {"allow": false, "reason": "default_deny"}

matches(policy) if {
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
    matches(policy)
}

permitted if {
    some policy in data.didaca.policies
    policy.effect == "allow"
    matches(policy)
}

decision := {"allow": false, "reason": "explicit_deny"} if {
    explicitly_denied
}

decision := {"allow": true, "reason": "policy_allow"} if {
    permitted
    not explicitly_denied
}
