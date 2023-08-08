import * as vscode from 'vscode';

export interface Item {
	range: vscode.Range;
	getText(): string;
}

export interface QuickPickItem extends vscode.QuickPickItem, Item {}

export const showPicker = ({
	editor,
	items,
}: {
	editor: vscode.TextEditor;
	items: Item[];
}): vscode.Disposable => {
	let accepted = false;
	const initialSelection = editor.selection;

	const maybeSoftUndo = async () => {
		if (!editor.selection.isEqual(initialSelection)) {
			await vscode.commands.executeCommand('cursorUndo');
		}
	};

	const quickPick = vscode.window.createQuickPick<QuickPickItem>();
	quickPick.placeholder = 'Selection';
	quickPick.items = items.map<QuickPickItem>((item) => ({
		...item,
		label: item.getText().replace(/\s+/g, ' '),
	}));

	quickPick.onDidChangeActive(async (item) => {
		await maybeSoftUndo();
		editor.selection =
			item[0] !== undefined
				? new vscode.Selection(item[0].range.start, item[0].range.end)
				: initialSelection;
	});
	quickPick.onDidAccept(() => {
		accepted = true;
		quickPick.dispose();
	});
	quickPick.onDidHide(async () => {
		if (accepted) return;
		// Cancel
		await maybeSoftUndo();
		quickPick.dispose();
	});

	quickPick.show();

	return quickPick;
};

export const activate = (context: vscode.ExtensionContext) => {
	vscode.commands.registerCommand('smart-select-picker.pick', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const selectionRanges = await vscode.commands
			.executeCommand(
				// TODO: why doesn't this respect options such as editor.smartSelect.{selectLeadingAndTrailingWhitespace,selectSubwords}?
				// https://github.com/microsoft/vscode/blob/42b4bf06704b84b40177f62405497a557a8fd73d/src/vs/editor/contrib/smartSelect/browser/smartSelect.ts#L317
				// https://github.com/microsoft/vscode/issues/189972
				'vscode.executeSelectionRangeProvider',
				editor.document.uri,
				[editor.selection.active],
			)
			.then((xs) => xs as Array<vscode.SelectionRange>);

		const items: Array<Item> = [];
		const addToItems = (n: vscode.SelectionRange) => {
			const candidate: Item = {
				getText: () => editor.document.getText(n.range),
				range: n.range,
			};
			items.push(candidate);
			if (n.parent !== undefined) {
				addToItems(n.parent);
			}
		};
		addToItems(selectionRanges[0]);

		const picker = showPicker({
			editor,
			items,
		});
		context.subscriptions.push(picker);
	});
};
