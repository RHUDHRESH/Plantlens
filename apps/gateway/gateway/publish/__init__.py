"""Publish TagFrames to the API ingest endpoint (see :mod:`gateway.publish.uplink`).

``FramePublisher`` is kept as the historical name of the publisher.
"""

from gateway.publish.uplink import Uplink

FramePublisher = Uplink

__all__ = ["FramePublisher", "Uplink"]
