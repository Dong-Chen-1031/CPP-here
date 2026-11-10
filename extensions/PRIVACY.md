# C++ Here Browser Extension Privacy Policy

_Last updated: 2026-10-30_

The C++ Here browser extension copies a competitive programming problem's sample test cases from the page you are on into the [C++ Here](https://cpp.doong.me) online editor. This policy explains what the extension reads, where that data goes, and what it stores.

## What the extension reads

The extension reads a page only when you ask it to, by clicking its toolbar button, pressing its keyboard shortcut, or choosing a parser from its context menu. It then reads that page's problem statement data: the problem name, the contest or group name, the time and memory limits, the input and output format, and the sample inputs and outputs. For a few websites, it also downloads the problem's files (for example a PDF or an archive of samples) from that website or its API, using your existing session on that website.

The extension does not read pages you have not asked it to parse, and it does not read your browsing history, form fields, passwords, or cookies.

## Where the data goes

The parsed problem is sent to a C++ Here editor tab in your browser (by default <https://cpp.doong.me/editor/>), which adds the samples as test cases. The extension itself does not send the problem to any server, and it contains no analytics or tracking code.

Once the test cases are in the editor, the C++ Here website handles them like test cases you typed in yourself:

- They are saved in your browser's local storage, so they are still there when you come back.
- Your code runs in your browser, so test cases are not sent to a server to run it. (When the server-side compiler is used, only your code is sent, to compile it.)
- If you create a share link, your code and test cases are uploaded to the C++ Here server so that others can open the link.
- The website uses [PostHog](https://posthog.com) for product analytics. When test cases are imported from the extension, it records that an import happened, how many problems and test cases were imported, and the problem or contest name.

The data is not sold, not used for advertising, and not used to determine creditworthiness or for lending purposes.

## What the extension stores

The extension stores its settings in your browser's extension storage: your custom parser rules, the target editor URL, and whether debug mode is on. These settings stay in your browser and are removed when you uninstall the extension.

## Permissions

- **activeTab** and **scripting**: to read the problem on the tab you asked the extension to parse, and to deliver it to the C++ Here editor tab.
- **contextMenus**: for the "Parse with" menu on the toolbar button.
- **storage**: for the settings above.
- **Access to cpp.doong.me**: to find an open editor tab, or open a new one, and deliver the problem to it.
- **Optional access to a few other websites**: requested only when you parse a problem on a website whose problem files are served from another domain, or when you point the extension at a local or preview C++ Here editor.

## Contact

Questions about this policy can be opened as an issue at <https://github.com/Dong-Chen-1031/CPP-here/issues>.
