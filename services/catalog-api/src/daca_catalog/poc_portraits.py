"""Local, synthetic portraits for named PoC personas, never for technical identities."""

from .models import DemoUser

PORTRAIT_USER_IDS = (
    "jan.waser",
    "christian.man", "christian.spider", "cinthya.thor", "daniel.wenger", "fausto.marzo",
    "eliane.rossi", "giuseppe.starwars", "hong.an.captain", "lawrence.hill",
    "marcello.hebeisa", "matteo.duca", "mirjam.keller", "sibilla.micheli", "thomas.wikinger",
)


def seed_poc_portraits(session):
    """Backfill existing installations, preserving an already assigned personal photo."""
    for identity in PORTRAIT_USER_IDS:
        user = session.get(DemoUser, identity)
        if user is not None and user.selectable and (
            not user.avatar_url
            or (identity == "fausto.marzo" and user.avatar_url == "/assets/data-owners/fausto-marzo.svg")
        ):
            user.avatar_url = f"/assets/data-owners/{identity.replace('.', '-')}.webp"
    session.flush()


if __name__ == "__main__":
    from .database import default_session_factory
    from .settings import get_settings

    with default_session_factory(get_settings())() as session:
        seed_poc_portraits(session)
        session.commit()
    print("Missing PoC portraits and the legacy Fausto initials avatar are updated.")
