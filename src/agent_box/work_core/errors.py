"""Provider-neutral errors for the production Work Core."""


class WorkCoreError(RuntimeError):
    """Base class for Work Core failures."""


class InvalidProjection(WorkCoreError):
    pass


class InvalidRef(WorkCoreError):
    pass


class ProviderUnavailable(WorkCoreError):
    pass


class CapabilityUnsupported(WorkCoreError):
    pass


class DispatchFailed(WorkCoreError):
    pass


class ExecutionNotResumable(WorkCoreError):
    pass
