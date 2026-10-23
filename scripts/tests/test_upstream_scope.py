import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('report_upstream', Path(__file__).resolve().parents[1] / 'report-upstream.py')
REPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REPORT)


class UpstreamScopeTests(unittest.TestCase):
    def test_desktop_shared_files_are_excluded_but_nas_windows_and_quotas_are_not(self):
        result = REPORT.report({'tag': 'v0.77.0', 'commit': 'baseline'},
                               {'tag_name': 'v0.78.0', 'published_at': 'synthetic'},
                               ['src/shared/trayLayout.js', 'src/electron/newWindow.js',
                                'src/hub/windowsStream.js', 'src/shared/limits/core.js',
                                'package-lock.json', 'new-unknown-file.js'])
        self.assertIn('| excluded desktop/Worker | 2 |', result)
        self.assertIn('| shared | 1 |', result)
        self.assertIn('| hub | 1 |', result)
        self.assertIn('| dependencies | 1 |', result)
        self.assertIn('| other (review) | 1 |', result)
        self.assertIn('- [excluded] `src/shared/trayLayout.js`', result)
        self.assertIn('- `src/hub/windowsStream.js`', result)


if __name__ == '__main__':
    unittest.main()
