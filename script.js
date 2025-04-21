// --- DOM Element References ---
const container = document.getElementById('mindmap');
const emotionPanel = document.getElementById('emotion-panel');
const panelTitle = document.getElementById('panel-title');
const panelDescription = document.getElementById('panel-description');
const panelCloseBtn = document.getElementById('panel-close-btn');
const panelToggleChildrenBtn = document.getElementById('panel-toggle-children-btn');
const panelFeelYesBtn = document.getElementById('panel-feel-yes-btn');
const panelFeelNoBtn = document.getElementById('panel-feel-no-btn');
const panelNotesArea = document.getElementById('panel-notes-area');
const panelSaveNoteBtn = document.getElementById('panel-save-note-btn');
const panelNextBtn = document.getElementById('panel-next-btn');
const tourBtn = document.getElementById('tour-btn');
const filterBtn = document.getElementById('filter-btn');

// --- Global State Variables ---
let network = null;
let nodes = new vis.DataSet();
let edges = new vis.DataSet();
let allEmotionData = []; // Store original data for hierarchy traversal
let currentSelectedNodeId = null; // Track the node shown in the panel
let isTourActive = false;
let tourStack = [];
let currentTourNodeId = null; // This seems potentially unused now? Review later.
let isFiltered = false;
let visibleNodeIds = new Set();

// --- Network Configuration ---
const options = {
	layout: {
		hierarchical: {
			enabled: true,
			levelSeparation: 150,
			nodeSpacing: 120,
			treeSpacing: 150,
			direction: 'LR',
			sortMethod: 'directed',
			edgeMinimization: true,
			parentCentralization: true
		}
	},
	edges: {
		arrows: 'to',
		smooth: {
			enabled: true,
			type: 'cubicBezier',
			forceDirection: 'horizontal',
			roundness: 0.4
		}
	},
	nodes: {
		shape: 'box',
		size: 16,
		font: {
			size: 14,
			multi: true,
			align: 'left'
		},
		borderWidth: 1,
		shadow: false
	},
	physics: {
		enabled: false
	},
	interaction: {
		tooltipDelay: 200,
		hideEdgesOnDrag: false,
		navigationButtons: false,
		keyboard: true,
		zoomView: true // Ensure zoom is enabled
	}
};

// --- Core Data & Network Functions ---

// Calculates hierarchical levels for nodes
function calculateLevels(nodeId, currentLevel, nodeMap, levelMap) {
	if (levelMap[nodeId] !== undefined && levelMap[nodeId] >= currentLevel) {
		return;
	}
	levelMap[nodeId] = currentLevel;
	const children = nodeMap[nodeId]?.children || [];
	children.forEach(childId => {
		calculateLevels(childId, currentLevel + 1, nodeMap, levelMap);
	});
}

// Builds the vis.DataSet objects from the raw emotion data
function buildDataSets() {
	// Call buildDataSetsWithSavedStates with empty saved states to create a fresh dataset
	buildDataSetsWithSavedStates({});
}

// Determines the visual style of a node based on its state
function getNodeStyle(node) {
	const baseStyle = {};

	// Add selected state styling
	if (node.id === currentSelectedNodeId) {
		baseStyle.borderWidth = 3;
		baseStyle.shadow = true;
		baseStyle.shadowColor = 'rgba(0,0,0,0.3)';
		baseStyle.shadowSize = 10;
		baseStyle.shadowX = 0;
		baseStyle.shadowY = 0;
	}

	// Add state-specific styling
	if (node._feltState === true) {
		return { ...baseStyle, background: '#dcfadc', border: '#4caf50' }; // Felt
	} else if (node._feltState === false) {
		return { ...baseStyle, background: '#f5f5f5', border: '#bdbdbd' }; // Not Felt
	} else if (node._childrenHidden) {
		return { ...baseStyle, background: '#fff', border: '#2196F3' }; // Unanswered and Collapsed
	} else {
		return { ...baseStyle, background: '#fff', border: '#2196F3' }; // Unanswered
	}
}

// Applies styles to all nodes currently in the DataSet
function applyAllNodeStyles() {
	const nodesToUpdate = [];
	nodes.forEach(node => {
		nodesToUpdate.push({
			id: node.id,
			color: getNodeStyle(node),
			font: {
				size: node.id === currentSelectedNodeId ? 16 : 14,
				multi: true,
				align: 'left'
			}
		});
	});
	if (nodesToUpdate.length > 0) {
		nodes.update(nodesToUpdate);
	}
}

// Recursive function to get all descendants of a node
function getAllDescendantIds(nodeId) {
	let descendants = [];
	const directChildren = allEmotionData.filter(e => e.parentId === nodeId);
	directChildren.forEach(child => {
		descendants.push(child.id);
		descendants = descendants.concat(getAllDescendantIds(child.id));
	});
	return descendants;
}

// Hides descendants of initially collapsed nodes
function applyInitialVisibility() {
	console.log("Applying initial visibility...");
	const nodesToUpdate = [];
	const edgesToUpdate = [];

	// Find root node
	const rootNode = allEmotionData.find(e => e.parentId === null);
	if (!rootNode) {
		console.error("No root node found!");
		return;
	}

	// Make sure root node is visible
	nodesToUpdate.push({ id: rootNode.id, hidden: false, _originallyHidden: false });

	// Process direct children of root first
	const directChildrenOfRoot = allEmotionData.filter(e => e.parentId === rootNode.id);
	directChildrenOfRoot.forEach(child => {
		// Show all direct children of root
		nodesToUpdate.push({ id: child.id, hidden: false, _originallyHidden: false });

		// Show all edges to direct children
		const edgeId = `${rootNode.id}-to-${child.id}`;
		edgesToUpdate.push({ id: edgeId, hidden: false, _originallyHidden: false });

		// Check if this child should be collapsed
		const childNode = nodes.get(child.id);
		if (childNode && childNode._childrenHidden) {
			// Hide all descendants of this child
			const descendants = getAllDescendantIds(child.id);
			descendants.forEach(descId => {
				nodesToUpdate.push({ id: descId, hidden: true, _originallyHidden: true });

				// Hide the edge to this descendant
				const parentId = allEmotionData.find(e => e.id === descId)?.parentId;
				if (parentId) {
					const edgeId = `${parentId}-to-${descId}`;
					edgesToUpdate.push({ id: edgeId, hidden: true, _originallyHidden: true });
				}
			});
		}
	});

	// Hide any remaining nodes that are descendants of other collapsed nodes
	nodes.forEach(node => {
		if (node.id !== rootNode.id && !directChildrenOfRoot.some(c => c.id === node.id)) {
			const ancestorPath = getAncestorPath(node.id);
			const hasCollapsedAncestor = ancestorPath.some(ancId => {
				const ancNode = nodes.get(ancId);
				return ancNode && ancNode._childrenHidden;
			});

			if (hasCollapsedAncestor && !node.hidden) {
				nodesToUpdate.push({ id: node.id, hidden: true, _originallyHidden: true });

				// Hide the edge to this node
				const parentId = allEmotionData.find(e => e.id === node.id)?.parentId;
				if (parentId) {
					const edgeId = `${parentId}-to-${node.id}`;
					edgesToUpdate.push({ id: edgeId, hidden: true, _originallyHidden: true });
				}
			}
		}
	});

	if (nodesToUpdate.length > 0) nodes.update(nodesToUpdate);
	if (edgesToUpdate.length > 0) edges.update(edgesToUpdate);
	console.log(`Initial visibility applied: ${nodesToUpdate.length} nodes, ${edgesToUpdate.length} edges`);
}

// Helper function to get the path from a node to the root
function getAncestorPath(nodeId) {
	const path = [];
	let currentId = nodeId;

	while (currentId !== null) {
		const parent = allEmotionData.find(e => e.id === currentId)?.parentId;
		if (parent !== null && parent !== undefined) {
			path.push(parent);
			currentId = parent;
		} else {
			currentId = null;
		}
	}

	return path;
}

// Creates the vis.js Network instance with only visible nodes
function initializeNetwork() {
	const data = { nodes, edges };
	network = new vis.Network(container, data, options);

	// Basic stabilized event logging
	network.on("stabilized", function () {
		console.log("Network stabilized");
	});
}

// Rebuilds the network with only the visible nodes
function rebuildNetworkWithVisibleNodes(useAnimation = false) {
	// If no network exists yet, return
	if (!network) return;

	console.log(`Rebuilding network with ${useAnimation ? 'animation' : 'no animation'}...`);

	// Save current position and selection state
	const wasPanelOpen = !emotionPanel.classList.contains('hidden');
	const selectedNodeId = currentSelectedNodeId;
	let selectedNodePosition = null;

	// Save the position of selected node or center of network
	if (selectedNodeId && visibleNodeIds.has(selectedNodeId)) {
		try {
			selectedNodePosition = network.getPositions([selectedNodeId])[selectedNodeId];
			console.log(`Saved position of node ${selectedNodeId}:`, selectedNodePosition);
		} catch (e) {
			console.warn(`Couldn't get position of node ${selectedNodeId}:`, e);
		}
	}

	// Save current visible node IDs
	if (visibleNodeIds.size === 0) {
		// Initialize with root node and its children if empty
		const rootNode = allEmotionData.find(e => e.parentId === null);
		if (rootNode) {
			visibleNodeIds.add(rootNode.id);
			const directChildren = allEmotionData.filter(e => e.parentId === rootNode.id);
			directChildren.forEach(child => visibleNodeIds.add(child.id));
		}
	}

	// Create new DataSets with only visible nodes and their edges
	const visibleNodes = new vis.DataSet();
	const visibleEdges = new vis.DataSet();

	// Add visible nodes to the new DataSet
	nodes.forEach(node => {
		if (visibleNodeIds.has(node.id)) {
			visibleNodes.add(node);
		}
	});

	// Add edges between visible nodes
	edges.forEach(edge => {
		if (visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)) {
			visibleEdges.add(edge);
		}
	});

	console.log(`Filtered to ${visibleNodes.length} nodes and ${visibleEdges.length} edges`);

	// Destroy old network and create new one
	const networkContainer = network.body.container;
	network.destroy();

	// Create new network with visible nodes only
	network = new vis.Network(networkContainer, { nodes: visibleNodes, edges: visibleEdges }, options);

	// Reattach event listeners
	network.on("click", handleNetworkClick);
	network.on("doubleClick", handleNodeDoubleClick);
	network.on("stabilized", function () {
		console.log("Rebuilt network stabilized");
		// Apply styles after stabilization to ensure selection is visible
		applyAllNodeStyles();
	});

	// Apply selection styles immediately - don't wait for stabilization
	applyAllNodeStyles();

	// Focus back on the previously selected node
	if (selectedNodeId && visibleNodeIds.has(selectedNodeId)) {
		network.focus(selectedNodeId, {
			scale: 1.0,
			animation: false
		});

		// Restore the network selection state
		network.selectNodes([selectedNodeId], false);

		// Reopen the panel if it was open before
		if (wasPanelOpen) {
			console.log(`Refocusing on node ${selectedNodeId} and reopening panel`);
			showPanelForNode(selectedNodeId);

			// Apply styles again after showing panel to ensure selection is visible
			applyAllNodeStyles();
		}
	} else {
		// If there's no selected node, just fit the view
		console.log("Fitting network to view (no selected node)");
		network.fit({
			animation: false
		});
	}
}

// Sets up all event listeners for the network and UI elements
function setupEventListeners() {
	// Network events
	network.on("click", handleNetworkClick);
	network.on("doubleClick", handleNodeDoubleClick);

	// Panel events
	panelCloseBtn.addEventListener('click', () => {
		hidePanel();
		if (isTourActive) { endTour(); }
	});
	panelToggleChildrenBtn.addEventListener('click', handleToggleChildrenClick);
	panelFeelYesBtn.addEventListener('click', () => handleFeelDecision(true));
	panelFeelNoBtn.addEventListener('click', () => handleFeelDecision(false));
	panelSaveNoteBtn.addEventListener('click', saveNote);
	panelNextBtn.addEventListener('click', nextTourEmotion);

	// Control events
	tourBtn.addEventListener('click', toggleTour);
	filterBtn.addEventListener('click', toggleFilterMyEmotions);
}

// Fetches data and initializes the application
async function loadEmotionData() {
	try {
		const response = await fetch('emotions.json');
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		allEmotionData = await response.json();

		buildDataSets();

		// Initialize visible nodes with root and its direct children
		const rootNode = allEmotionData.find(e => e.parentId === null);
		if (rootNode) {
			console.log("Initializing with root node and direct children");
			visibleNodeIds.add(rootNode.id);

			const directChildren = allEmotionData.filter(e => e.parentId === rootNode.id);
			directChildren.forEach(child => {
				visibleNodeIds.add(child.id);
			});
		}

		// Initialize the network
		initializeNetwork();
		setupEventListeners();

		// Add reset instructions
		const instructionsDiv = document.createElement('div');
		instructionsDiv.id = 'reset-instructions';
		instructionsDiv.innerHTML = '<p>Note: To reset all emotions and notes, simply reload the page.</p>';
		instructionsDiv.style.position = 'fixed';
		instructionsDiv.style.bottom = '10px';
		instructionsDiv.style.left = '10px';
		instructionsDiv.style.background = 'rgba(255, 255, 255, 0.8)';
		instructionsDiv.style.padding = '5px 10px';
		instructionsDiv.style.borderRadius = '5px';
		instructionsDiv.style.fontSize = '12px';
		document.body.appendChild(instructionsDiv);

		// Rebuild the network to apply visibility (with animation for initial view)
		setTimeout(() => {
			rebuildNetworkWithVisibleNodes(true);
		}, 500);

	} catch (error) {
		console.error("Error loading or processing emotion data:", error);
		if (panelDescription) { panelDescription.textContent = 'Error loading data.'; }
	}
}


// --- Network Interaction Handlers ---

// Handles clicks on nodes or the background
function handleNetworkClick(params) {
	if (params.nodes.length > 0) {
		const nodeId = params.nodes[0];
		showPanelForNode(nodeId);
	} else {
		hidePanel();
	}
}

// Handles double-clicks on nodes (for collapsing/expanding)
function handleNodeDoubleClick(params) {
	if (params.nodes.length > 0) {
		const nodeId = params.nodes[0];
		toggleNodeCollapse(nodeId);
	}
}


// --- Panel Logic ---

// Shows the side panel with details for a specific node
function showPanelForNode(nodeId) {
	// Make sure the node is in the visible set
	if (!visibleNodeIds.has(nodeId)) {
		console.warn(`Attempting to show panel for non-visible node ${nodeId}`);
		return;
	}

	const previousSelectedNodeId = currentSelectedNodeId; // Store previous selection (can keep for potential future use)
	currentSelectedNodeId = nodeId;
	const nodeData = nodes.get(nodeId);

	// Set the network's selection state explicitly
	if (network) {
		network.selectNodes([nodeId], false); // false = don't trigger selection events
	}

	if (nodeData) {
		panelTitle.textContent = nodeData.label;
		panelDescription.textContent = nodeData.description;
		panelNotesArea.value = nodeData._notes || '';

		panelFeelYesBtn.classList.toggle('selected-feel', nodeData._feltState === true);
		panelFeelNoBtn.classList.toggle('selected-feel', nodeData._feltState === false);

		if (isTourActive) {
			panelToggleChildrenBtn.style.display = 'none';
			panelNextBtn.classList.remove('hidden');
			panelNextBtn.disabled = nodeData._feltState === null; // Disable if no decision made
		} else {
			panelNextBtn.classList.add('hidden');
			panelNextBtn.disabled = false;
			const children = allEmotionData.filter(e => e.parentId === nodeId);
			panelToggleChildrenBtn.style.display = children.length > 0 ? 'inline-block' : 'none';
			if (children.length > 0) {
				panelToggleChildrenBtn.textContent = nodeData._childrenHidden ? "Show Children" : "Hide Children";
			}
		}

		emotionPanel.classList.remove('hidden');
		applyAllNodeStyles(); // Apply styles globally after panel update
	} else {
		console.error("Node data not found for ID:", nodeId);
		hidePanel();
	}
}

// Hides the side panel
function hidePanel() {
	const previousSelectedNodeId = currentSelectedNodeId;
	currentSelectedNodeId = null;
	emotionPanel.classList.add('hidden');

	// Clear the network's selection state
	if (network) {
		network.selectNodes([]); // Clear selection
	}

	if (previousSelectedNodeId) { // Only update styles if something was selected
		applyAllNodeStyles(); // Apply styles globally to remove selection
	}
}

// Handles click on the 'Show/Hide Children' button in the panel
function handleToggleChildrenClick() {
	if (!currentSelectedNodeId || !network) return;
	console.log(`Toggle children button clicked for node ${currentSelectedNodeId}`);

	// Ensure the node is visible
	if (!visibleNodeIds.has(currentSelectedNodeId)) {
		console.warn("Current selected node is not visible, cannot toggle children");
		return;
	}

	// Toggle the node's collapse state (no animation)
	toggleNodeCollapse(currentSelectedNodeId, false);
}

// Handles clicks on the 'Yes'/'No' feel buttons
function handleFeelDecision(isFelt) {
	if (!currentSelectedNodeId) return;
	const node = nodes.get(currentSelectedNodeId);
	if (!node) return;

	console.log(`Feel decision for node ${currentSelectedNodeId}: ${isFelt}`);

	// Toggle the felt state - if already in this state, clear it
	const newState = (node._feltState === isFelt) ? null : isFelt;

	// Update the node's felt state
	nodes.update({
		id: currentSelectedNodeId,
		_feltState: newState,
		color: getNodeStyle({ ...node, _feltState: newState })
	});

	// Update button appearance
	panelFeelYesBtn.classList.toggle('selected-feel', newState === true);
	panelFeelNoBtn.classList.toggle('selected-feel', newState === false);

	// Handle visibility changes based on felt state
	if (newState === false && !node._childrenHidden) {
		// If marked as "not felt" and children are visible, collapse the node
		console.log(`Auto-collapsing node ${currentSelectedNodeId} due to "not felt" state`);
		toggleNodeCollapse(currentSelectedNodeId, false); // No animation
	} else if (newState === true && node._childrenHidden) {
		// If marked as "felt" and children are hidden, expand the node
		console.log(`Auto-expanding node ${currentSelectedNodeId} due to "felt" state`);
		toggleNodeCollapse(currentSelectedNodeId, false); // No animation
	} else {
		// Just rebuild to update colors
		rebuildNetworkWithVisibleNodes(false); // No animation
	}

	// Update tour button state if in tour mode
	if (isTourActive) {
		panelNextBtn.disabled = newState === null;
	}

	console.log(`Node ${currentSelectedNodeId} felt state set to: ${newState}`);
}

// Saves the text from the notes area to the node data
function saveNote() {
	if (!currentSelectedNodeId) return;
	const noteText = panelNotesArea.value;
	nodes.update({
		id: currentSelectedNodeId,
		_notes: noteText
	});
	console.log(`Note saved for node ${currentSelectedNodeId}: "${noteText}"`);
	panelSaveNoteBtn.textContent = "Saved!";
	setTimeout(() => { panelSaveNoteBtn.textContent = "Save Note"; }, 1500);
}


// --- Collapse/Expand Logic ---

// Toggles the visibility of a node's children and descendants
function toggleNodeCollapse(nodeId, useAnimation = false) {
	const node = nodes.get(nodeId);
	if (!node) return;

	const currentlyCollapsed = node._childrenHidden;
	const newState = !currentlyCollapsed;

	// Update the node's collapsed state
	nodes.update({
		id: nodeId,
		_childrenHidden: newState,
		color: getNodeStyle({ ...node, _childrenHidden: newState })
	});

	// Update visibility based on the new state
	if (newState === false) { // Expanding
		console.log(`Expanding node ${nodeId}`);

		// Add direct children to visible nodes
		const directChildren = allEmotionData.filter(e => e.parentId === nodeId);
		directChildren.forEach(child => {
			visibleNodeIds.add(child.id);

			// If a child is expanded, we also need to add its children
			const childNode = nodes.get(child.id);
			if (childNode && !childNode._childrenHidden) {
				// Recursively process this child's visibility
				processNodeVisibility(child.id, {});
			}
		});

	} else { // Collapsing
		console.log(`Collapsing node ${nodeId}`);

		// Remove all descendants from visible nodes
		const descendantIds = getAllDescendantIds(nodeId);
		descendantIds.forEach(descId => {
			visibleNodeIds.delete(descId);
		});
	}

	// Update button text if this is the selected node
	if (currentSelectedNodeId === nodeId && !isTourActive && panelToggleChildrenBtn.style.display !== 'none') {
		panelToggleChildrenBtn.textContent = newState ? "Show Children" : "Hide Children";
	}

	// Rebuild the network with only visible nodes
	rebuildNetworkWithVisibleNodes(useAnimation);
}


// --- Tour Logic ---

// Toggles the guided tour state
function toggleTour() {
	if (isTourActive) {
		endTour();
	} else {
		startTour();
	}
}

// Starts the guided tour
function startTour() {
	isTourActive = true;
	tourBtn.textContent = "End Tour";
	tourStack = [];

	const rootNode = allEmotionData.find(e => e.parentId === null);
	if (rootNode) {
		const children = allEmotionData.filter(e => e.parentId === rootNode.id).map(e => e.id);
		for (let i = children.length - 1; i >= 0; i--) {
			tourStack.push(children[i]);
		}
	}

	if (tourStack.length > 0) {
		const firstNodeId = tourStack.pop();
		const nodeData = nodes.get(firstNodeId);
		if (nodeData) {
			network.focus(firstNodeId, { scale: 1.0, animation: true });
			showPanelForNode(firstNodeId);
		} else {
			console.warn("First tour node not found:", firstNodeId);
			endTour();
		}
	} else {
		endTour();
	}
	console.log("Tour started");
}

// Moves to the next emotion in the tour based on user decisions
function nextTourEmotion() {
	if (currentSelectedNodeId) {
		const previousNodeData = nodes.get(currentSelectedNodeId);
		if (previousNodeData && previousNodeData._feltState !== false) {
			const children = allEmotionData.filter(e => e.parentId === currentSelectedNodeId).map(e => e.id);
			for (let i = children.length - 1; i >= 0; i--) {
				tourStack.push(children[i]);
			}
			console.log(`Added children of ${currentSelectedNodeId} to stack.`);
		} else {
			console.log(`Pruning children of ${currentSelectedNodeId} because state is ${previousNodeData?._feltState}.`);
		}
	}

	if (tourStack.length === 0) {
		console.log("Tour stack empty.");
		endTour();
		return;
	}

	const nextNodeId = tourStack.pop();

	// Make sure the node is visible or will be visible
	if (!visibleNodeIds.has(nextNodeId)) {
		// Add this node to visible set
		visibleNodeIds.add(nextNodeId);

		// Make sure its parent is visible and expanded
		const parentId = allEmotionData.find(e => e.id === nextNodeId)?.parentId;
		if (parentId) {
			visibleNodeIds.add(parentId);
			const parentNode = nodes.get(parentId);
			if (parentNode && parentNode._childrenHidden) {
				// Expand the parent without animation
				nodes.update({
					id: parentId,
					_childrenHidden: false
				});

				// Process parent's visibility to ensure consistency
				processNodeVisibility(parentId, {});
			}
		}

		// Rebuild network without animation before focusing
		rebuildNetworkWithVisibleNodes(false);
	}

	const nextNodeData = nodes.get(nextNodeId);
	if (!nextNodeData) {
		console.warn("Node not found in tour stack:", nextNodeId, "continuing tour.");
		currentSelectedNodeId = null;
		nextTourEmotion();
		return;
	}

	// Now focus with animation
	network.focus(nextNodeId, {
		scale: 1.0,
		animation: {
			duration: 500,
			easingFunction: 'easeInOutQuad'
		}
	});
	showPanelForNode(nextNodeId);
}

// Ends the guided tour
function endTour() {
	isTourActive = false;
	tourBtn.textContent = "Start Guided Tour";
	tourStack = [];

	// Only update UI elements without modifying node data
	if (currentSelectedNodeId && !emotionPanel.classList.contains('hidden')) {
		panelNextBtn.classList.add('hidden');
		const nodeData = nodes.get(currentSelectedNodeId);
		if (nodeData) {
			const children = allEmotionData.filter(e => e.parentId === currentSelectedNodeId);
			panelToggleChildrenBtn.style.display = children.length > 0 ? 'inline-block' : 'none';
			if (children.length > 0) {
				panelToggleChildrenBtn.textContent = nodeData._childrenHidden ? "Show Children" : "Hide Children";
			}
		}
	}

	console.log("Tour ended");
}


// --- Filter Logic ---

// Toggles between showing all emotions and only 'felt' emotions
function toggleFilterMyEmotions() {
	if (isFiltered) {
		showAllEmotions();
	} else {
		filterToFeltEmotions();
	}
}

// Filters the network to show only nodes marked as 'felt' and their ancestors
function filterToFeltEmotions() {
	isFiltered = true;
	filterBtn.textContent = "Show All Emotions";
	console.log("Filtering to show only felt emotions and ancestors...");

	// Find felt nodes and their ancestors
	const feltNodeIds = nodes.getIds({ filter: item => item._feltState === true });
	const ancestorIds = new Set();

	// Add all ancestors of felt nodes to the ancestor set
	feltNodeIds.forEach(id => {
		let currentId = id;
		while (currentId !== null) {
			const parentId = allEmotionData.find(e => e.id === currentId)?.parentId;
			if (parentId !== null && parentId !== undefined) {
				ancestorIds.add(parentId);
				currentId = parentId;
			} else {
				currentId = null;
			}
		}
	});

	// Reset visible nodes
	visibleNodeIds = new Set([...feltNodeIds, ...ancestorIds]);

	// Ensure consistency of collapsed states
	// For each visible node, check if its children should be shown based on _childrenHidden
	visibleNodeIds.forEach(nodeId => {
		const node = nodes.get(nodeId);
		if (node && !node._childrenHidden) {
			// If children should be shown, add each child that is either felt or an ancestor
			const children = allEmotionData.filter(e => e.parentId === nodeId);
			children.forEach(child => {
				if (feltNodeIds.includes(child.id) || ancestorIds.has(child.id)) {
					visibleNodeIds.add(child.id);
				}
			});
		}
	});

	// Rebuild the network with visible nodes (no animation)
	rebuildNetworkWithVisibleNodes(false);
}

// Resets the view to show all emotions, respecting initial collapse states
function showAllEmotions() {
	isFiltered = false;
	filterBtn.textContent = "Show My Emotions";
	console.log("Showing all emotions...");

	// Save current node states before rebuilding
	const savedNodeStates = {};
	nodes.forEach(node => {
		savedNodeStates[node.id] = {
			_feltState: node._feltState,
			_notes: node._notes,
			_childrenHidden: node._childrenHidden
		};
	});

	// Rebuild the full dataset with saved states
	buildDataSetsWithSavedStates(savedNodeStates);

	// Reset visible nodes to root and direct children
	visibleNodeIds = new Set();
	const rootNode = allEmotionData.find(e => e.parentId === null);
	if (rootNode) {
		visibleNodeIds.add(rootNode.id);

		// Process the entire tree recursively to ensure consistency
		processNodeVisibility(rootNode.id, savedNodeStates);
	}

	// Rebuild the network (no animation)
	rebuildNetworkWithVisibleNodes(false);
}

// Helper function to process node visibility based on _childrenHidden state
function processNodeVisibility(nodeId, savedNodeStates) {
	const node = nodes.get(nodeId);
	if (!node) return;

	// Always add the current node to visible set
	visibleNodeIds.add(nodeId);

	// Get direct children
	const directChildren = allEmotionData.filter(e => e.parentId === nodeId);

	// Check if this node has its children hidden
	const isChildrenHidden = node._childrenHidden;

	if (!isChildrenHidden) {
		// If children are not hidden, process each child
		directChildren.forEach(child => {
			// Add child to visible set
			visibleNodeIds.add(child.id);

			// Recursively process this child's children if it doesn't have _childrenHidden
			const childNode = nodes.get(child.id);
			if (childNode && !childNode._childrenHidden) {
				processNodeVisibility(child.id, savedNodeStates);
			}
		});
	}
}

// Builds the vis.DataSet objects from the raw emotion data with saved states
function buildDataSetsWithSavedStates(savedStates = {}) {
	nodes.clear();
	edges.clear();

	const nodeMap = {};
	allEmotionData.forEach(e => { nodeMap[e.id] = { ...e, children: [] }; });
	allEmotionData.forEach(e => { if (e.parentId !== null && nodeMap[e.parentId]) { nodeMap[e.parentId].children.push(e.id); } });
	const levelMap = {};
	const rootNode = allEmotionData.find(e => e.parentId === null);
	if (rootNode) { calculateLevels(rootNode.id, 0, nodeMap, levelMap); }

	const processedNodes = allEmotionData.map(emotion => {
		const savedState = savedStates[emotion.id] || {};

		return {
			id: emotion.id,
			label: emotion.label,
			description: emotion.description || 'No description available.',
			level: levelMap[emotion.id],
			_childrenHidden: savedState._childrenHidden !== undefined ? savedState._childrenHidden : emotion.parentId !== null,
			_originallyHidden: false,
			_feltState: savedState._feltState !== undefined ? savedState._feltState : null,
			_notes: savedState._notes || ''
		};
	});

	const processedEdges = allEmotionData
		.filter(emotion => emotion.parentId !== null)
		.map(emotion => ({
			id: `${emotion.parentId}-to-${emotion.id}`,
			from: emotion.parentId,
			to: emotion.id,
			_originallyHidden: false
		}));

	nodes.add(processedNodes);
	edges.add(processedEdges);
	applyAllNodeStyles();
}


// --- Initialization ---
document.addEventListener('DOMContentLoaded', loadEmotionData); 