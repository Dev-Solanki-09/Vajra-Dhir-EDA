# packages/cubo-engine/src/cubo_manifest.py
"""
Pydantic v2 Schema for Open-CUBO Block Manifest (cubo.toml).
Encodes electrical ratings, simulation models, and signoff criteria.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field

class ElectricalRatings(BaseModel):
    vin_min: Optional[float] = None
    vin_nom: Optional[float] = None
    vin_max: Optional[float] = None
    vout: Optional[float] = None
    iout_max: Optional[float] = None
    fsw_hz: Optional[float] = None
    logic_level_v: Optional[float] = None

class SignoffCriteria(BaseModel):
    spice_model: Optional[str] = None
    max_ripple_mv: Optional[float] = None
    max_tj_c: Optional[float] = None
    esd_contact_kv: Optional[float] = None

class CuboMetadata(BaseModel):
    id: str
    name: str
    version: str
    tier: int = Field(default=1, ge=1, le=3)
    primary_ic: str
    description: str
    verified_by: str = "Vajra-Dhir Core Team"
    public_key_ed25519: Optional[str] = None
    signature_ed25519: Optional[str] = None

class CuboManifest(BaseModel):
    cubo: CuboMetadata
    electrical: ElectricalRatings
    signoff: SignoffCriteria
    interfaces: Dict[str, List[str]] = Field(default_factory=dict)
