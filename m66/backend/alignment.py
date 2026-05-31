import numpy as np
from typing import Tuple, List, Dict, Optional

MATRIX_THRESHOLD = 500

class NeedlemanWunsch:
    def __init__(self, match: int = 1, mismatch: int = -1, gap: int = -2):
        self.match = match
        self.mismatch = mismatch
        self.gap = gap

    def _get_score(self, a: str, b: str) -> int:
        if a == b:
            return self.match
        return self.mismatch

    def align(self, seq1: str, seq2: str, include_matrix: bool = True) -> Dict:
        n = len(seq1)
        m = len(seq2)

        score_matrix = np.zeros((n + 1, m + 1), dtype=int)
        traceback_matrix = np.zeros((n + 1, m + 1), dtype=int)

        for i in range(1, n + 1):
            score_matrix[i][0] = score_matrix[i - 1][0] + self.gap
            traceback_matrix[i][0] = 1

        for j in range(1, m + 1):
            score_matrix[0][j] = score_matrix[0][j - 1] + self.gap
            traceback_matrix[0][j] = 2

        for i in range(1, n + 1):
            for j in range(1, m + 1):
                match_score = score_matrix[i - 1][j - 1] + self._get_score(seq1[i - 1], seq2[j - 1])
                delete_score = score_matrix[i - 1][j] + self.gap
                insert_score = score_matrix[i][j - 1] + self.gap

                scores = [match_score, delete_score, insert_score]
                max_score = max(scores)
                score_matrix[i][j] = max_score
                traceback_matrix[i][j] = scores.index(max_score)

        align1, align2, matches = self._traceback(seq1, seq2, traceback_matrix)
        
        alignment_result = self._generate_alignment_result(align1, align2, matches)

        is_large = n > MATRIX_THRESHOLD or m > MATRIX_THRESHOLD

        result = {
            "seq1": seq1,
            "seq2": seq2,
            "aligned_seq1": align1,
            "aligned_seq2": align2,
            "alignment_string": alignment_result["alignment_string"],
            "score": int(score_matrix[n][m]),
            "matches": alignment_result["matches"],
            "mismatches": alignment_result["mismatches"],
            "gaps": alignment_result["gaps"],
            "alignment_details": alignment_result["details"],
            "is_large": is_large,
            "matrix_rows": n + 1,
            "matrix_cols": m + 1,
        }

        if include_matrix and not is_large:
            result["score_matrix"] = score_matrix.tolist()
            result["traceback_matrix"] = traceback_matrix.tolist()
        else:
            result["score_matrix"] = None
            result["traceback_matrix"] = None

        return result, score_matrix, traceback_matrix

    def _traceback(self, seq1: str, seq2: str, traceback_matrix: np.ndarray) -> Tuple[str, str, List[bool]]:
        i, j = len(seq1), len(seq2)
        align1 = []
        align2 = []
        matches = []

        while i > 0 or j > 0:
            direction = traceback_matrix[i][j]
            if direction == 0:
                align1.append(seq1[i - 1])
                align2.append(seq2[j - 1])
                matches.append(seq1[i - 1] == seq2[j - 1])
                i -= 1
                j -= 1
            elif direction == 1:
                align1.append(seq1[i - 1])
                align2.append("-")
                matches.append(False)
                i -= 1
            else:
                align1.append("-")
                align2.append(seq2[j - 1])
                matches.append(False)
                j -= 1

        return align1[::-1], align2[::-1], matches[::-1]

    def _generate_alignment_result(self, align1: List[str], align2: List[str], matches: List[bool]) -> Dict:
        alignment_chars = []
        details = []
        match_count = 0
        mismatch_count = 0
        gap_count = 0

        for a, b, is_match in zip(align1, align2, matches):
            detail = {
                "char1": a,
                "char2": b,
                "type": ""
            }
            if a == "-" or b == "-":
                alignment_chars.append(" ")
                detail["type"] = "gap"
                gap_count += 1
            elif is_match:
                alignment_chars.append("|")
                detail["type"] = "match"
                match_count += 1
            else:
                alignment_chars.append(".")
                detail["type"] = "mismatch"
                mismatch_count += 1
            details.append(detail)

        return {
            "alignment_string": "".join(alignment_chars),
            "matches": match_count,
            "mismatches": mismatch_count,
            "gaps": gap_count,
            "details": details
        }

def parse_fasta(content: str) -> List[Tuple[str, str]]:
    sequences = []
    current_header = ""
    current_sequence = []
    
    for line in content.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if current_header and current_sequence:
                sequences.append((current_header, "".join(current_sequence)))
            current_header = line[1:].strip()
            current_sequence = []
        else:
            current_sequence.append(line.upper())
    
    if current_header and current_sequence:
        sequences.append((current_header, "".join(current_sequence)))
    
    return sequences
