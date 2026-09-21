from app.modules.destinations.base import DestinationBackend
from app.modules.destinations.local import LocalDestination
from app.modules.destinations.git_destination import GitDestination
from app.modules.destinations.smb import SMBDestination
from app.modules.destinations.telegram import TelegramDestination

DESTINATIONS: dict[str, type[DestinationBackend]] = {
    "local": LocalDestination,
    "forgejo": GitDestination,
    "github": GitDestination,
    "gitea": GitDestination,
    "git": GitDestination,
    "smb": SMBDestination,
    "telegram": TelegramDestination,
}


def get_destination(name: str) -> DestinationBackend:
    cls = DESTINATIONS.get(name)
    if cls is None:
        raise ValueError(f"Unknown destination type: {name}")
    return cls()
