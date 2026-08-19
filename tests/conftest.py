import json
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "app" / "py"))


@pytest.fixture(scope="session")
def example_packets():
    examples = REPO / "app" / "examples"
    manifest = json.loads((examples / "manifest.json").read_text())
    return [json.loads((examples / name).read_text()) for name in manifest]


@pytest.fixture()
def minimal_packet():
    """A packet with every field the stats functions read."""
    return {
        "id": "pp-1",
        "subject": {
            "id": "P1",
            "sex": "FEMALE",
            "dateOfBirth": "1990-06-15",
            "timeAtLastEncounter": {"age": {"iso8601duration": "P30Y6M"}},
            "vitalStatus": {"status": "ALIVE"},
        },
        "phenotypicFeatures": [
            {
                "type": {"id": "HP:0000001", "label": "Feature A"},
                "onset": {"age": {"iso8601duration": "P5Y"}},
                "severity": {"label": "Severe"},
            },
            {"type": {"id": "HP:0000002", "label": "Feature B"}, "excluded": True},
        ],
        "diseases": [
            {
                "term": {"id": "MONDO:0000001", "label": "Disease X"},
                "onset": {"age": {"iso8601duration": "P2Y6M"}},
            }
        ],
        "interpretations": [
            {
                "progressStatus": "SOLVED",
                "diagnosis": {
                    "disease": {"id": "MONDO:0000001", "label": "Disease X"},
                    "genomicInterpretations": [
                        {
                            "interpretationStatus": "CAUSATIVE",
                            "variantInterpretation": {
                                "acmgPathogenicityClassification": "PATHOGENIC",
                                "variationDescriptor": {
                                    "geneContext": {"valueId": "HGNC:1", "symbol": "GENE1"},
                                    "expressions": [{"value": "NM_1:c.1A>G"}],
                                    "allelicState": {"label": "heterozygous"},
                                },
                            },
                        }
                    ],
                },
            }
        ],
        "measurements": [
            {
                "assay": {"id": "LOINC:1", "label": "Assay 1"},
                "value": {"quantity": {"unit": {"label": "mg/dL"}, "value": 42.0}},
                "timeObserved": {"age": {"iso8601duration": "P10Y"}},
            },
            {
                "assay": {"id": "LOINC:1", "label": "Assay 1"},
                "value": {"quantity": {"unit": {"label": "mg/dL"}, "value": 58.0}},
                "timeObserved": {"age": {"iso8601duration": "P20Y"}},
            },
        ],
    }
