import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  //MouseEvent as ReactMouseEvent,
} from 'react';
import { Eraser } from 'lucide-react';
import { DEFAULT_TASK_TYPES, STORAGE_KEY_CUSTOM_TASK_TYPES } from '../types/TaskTypes';

/**
 * Props interface for the UserInstructions component
 * @property {string} instructions - The current instructions text
 * @property {function} setInstructions - Function to update instructions
 * @property {string} selectedTaskType - The ID of the selected task type
 */
interface UserInstructionsProps {
  instructions: string;
  setInstructions: (value: string) => void;
  selectedTaskType: string;
}

/**
 * UserInstructions Component
 *
 * This component provides a text area for users to enter custom instructions
 * that will be appended to the end of the copied content. This is useful for
 * adding context, requirements, or special notes when sharing code snippets.
 *
 * The component now also loads predefined prompts based on the selected task type.
 *
 * @param {string} instructions - Current instructions text value
 * @param {function} setInstructions - State setter function for updating instructions
 * @param {string} selectedTaskType - The ID of the selected task type
 * @returns {JSX.Element} - The rendered component
 */
const UserInstructions = ({
  instructions,
  setInstructions,
  selectedTaskType,
}: UserInstructionsProps): JSX.Element => {
  const [allTaskTypes, setAllTaskTypes] = useState(DEFAULT_TASK_TYPES);

  // State for resizing
  const [instructionsHeight, setInstructionsHeight] = useState(126); // Default height
  const [instructionsWidth, setInstructionsWidth] = useState(100); // Default width percentage
  const [containerHeight, setContainerHeight] = useState<number | null>(null); // Dynamic container height
  const [containerVPadding, setContainerVPadding] = useState(0); // Sum of top+bottom padding
  const [isResizingVertical, setIsResizingVertical] = useState(false);
  const [isResizingHorizontal, setIsResizingHorizontal] = useState(false);
  const [isResizingCorner, setIsResizingCorner] = useState(false);

  // Initial mouse position for resize tracking
  const initialMousePosRef = useRef({ x: 0, y: 0 });
  const initialContainerHeightRef = useRef<number>(0);
  // Container ref for width calculation
  const containerRef = useRef(null as HTMLDivElement | null);

  // Min/max constraints
  const MIN_HEIGHT = 80;
  const MAX_HEIGHT = 600;
  const MIN_WIDTH_PERCENT = 30;
  const MAX_WIDTH_PERCENT = 100;

  // Load custom task types
  useEffect(() => {
    const loadCustomTaskTypes = () => {
      const savedCustomTypes = localStorage.getItem(STORAGE_KEY_CUSTOM_TASK_TYPES);
      if (savedCustomTypes) {
        try {
          const customTypes = JSON.parse(savedCustomTypes);
          setAllTaskTypes([...DEFAULT_TASK_TYPES, ...customTypes]);
        } catch (error) {
          console.error('Error parsing custom task types:', error);
        }
      }
    };

    // Initial load
    loadCustomTaskTypes();

    // Listen for our custom event for task type updates
    const handleCustomTaskTypesUpdated = () => {
      loadCustomTaskTypes();
    };

    // Listen for both events
    window.addEventListener('customTaskTypesUpdated', handleCustomTaskTypesUpdated);

    return () => {
      window.removeEventListener('customTaskTypesUpdated', handleCustomTaskTypesUpdated);
    };
  }, []);

  const handleClearInstructions = useCallback(() => {
    setInstructions('');
  }, [setInstructions]);

  // Update instructions when task type changes
  useEffect(() => {
    // Find the selected task type - load most current version from localStorage
    const loadCurrentTaskType = () => {
      // First check in memory
      let selectedTask = allTaskTypes.find((type: any) => type.id === selectedTaskType);

      // If not found or to ensure latest version, check localStorage for custom types
      if (!selectedTask || selectedTask.isCustom) {
        const savedCustomTypes = localStorage.getItem(STORAGE_KEY_CUSTOM_TASK_TYPES);
        if (savedCustomTypes) {
          try {
            const customTypes = JSON.parse(savedCustomTypes);
            const freshCustomTask = customTypes.find((type: any) => type.id === selectedTaskType);
            if (freshCustomTask) {
              selectedTask = freshCustomTask;
            }
          } catch (error) {
            console.error('Error finding custom task type:', error);
          }
        }
      }

      // If we found the task, update instructions
      if (selectedTask) {
        setInstructions(selectedTask.prompt);
      }
    };

    loadCurrentTaskType();

    // Also listen for task type updates
    const handleCustomTaskTypesUpdated = () => {
      loadCurrentTaskType();
    };

    window.addEventListener('customTaskTypesUpdated', handleCustomTaskTypesUpdated);

    return () => {
      window.removeEventListener('customTaskTypesUpdated', handleCustomTaskTypesUpdated);
    };
  }, [selectedTaskType, setInstructions, allTaskTypes]);

  // Resize handlers
  const handleVerticalResizeStart = useCallback(
    (e: any) => {
      e.preventDefault();
      setIsResizingVertical(true);
      initialMousePosRef.current.y = e.clientY;
      initialContainerHeightRef.current = containerHeight ?? instructionsHeight + containerVPadding;
    },
    [containerHeight, instructionsHeight, containerVPadding]
  );

  const handleHorizontalResizeStart = useCallback((e: any) => {
    e.preventDefault();
    setIsResizingHorizontal(true);
    initialMousePosRef.current.x = e.clientX;
  }, []);

  const handleCornerResizeStart = useCallback((e: any) => {
    e.preventDefault();
    setIsResizingCorner(true);
    initialMousePosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Handle resize effects
  useEffect(() => {
    let animationFrameId: number;

    const handleResize = (e: MouseEvent) => {
      if (!isResizingVertical && !isResizingHorizontal && !isResizingCorner) return;

      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        // Handle vertical resizing from the top (resize container and instructionsHeight)
        if (isResizingVertical || isResizingCorner) {
          const deltaY = e.clientY - initialMousePosRef.current.y;
          let newContainerHeight =
            (containerHeight ?? instructionsHeight + containerVPadding) - deltaY;
          const minContainerHeight = MIN_HEIGHT + containerVPadding;
          const maxContainerHeight = MAX_HEIGHT + containerVPadding;
          newContainerHeight = Math.max(
            minContainerHeight,
            Math.min(newContainerHeight, maxContainerHeight)
          );
          setContainerHeight(newContainerHeight);
          setInstructionsHeight(newContainerHeight - containerVPadding);
          initialMousePosRef.current.y = e.clientY;
        }

        // Handle horizontal resizing
        if ((isResizingHorizontal || isResizingCorner) && containerRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect();
          const containerWidth = containerRect.width;
          const deltaX = e.clientX - initialMousePosRef.current.x;

          const percentageDelta = (deltaX / containerWidth) * 100;
          const newWidthPercent = Math.max(
            MIN_WIDTH_PERCENT,
            Math.min(instructionsWidth + percentageDelta, MAX_WIDTH_PERCENT)
          );

          setInstructionsWidth(newWidthPercent);
          initialMousePosRef.current.x = e.clientX;
        }
      });
    };

    const handleResizeEnd = () => {
      cancelAnimationFrame(animationFrameId);
      setIsResizingVertical(false);
      setIsResizingHorizontal(false);
      setIsResizingCorner(false);
    };

    // Add event listeners if resizing
    if (isResizingVertical || isResizingHorizontal || isResizingCorner) {
      document.addEventListener('mousemove', handleResize, { passive: true });
      document.addEventListener('mouseup', handleResizeEnd);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [
    isResizingVertical,
    isResizingHorizontal,
    isResizingCorner,
    instructionsHeight,
    instructionsWidth,
  ]);

  // Save resize dimensions to localStorage
  useEffect(() => {
    localStorage.setItem('pastemax-instructions-height', instructionsHeight.toString());
    localStorage.setItem('pastemax-instructions-width', instructionsWidth.toString());
    if (containerHeight !== null) {
      localStorage.setItem('pastemax-instructions-container-height', containerHeight.toString());
    }
  }, [instructionsHeight, instructionsWidth, containerHeight]);

  // Load saved dimensions and calculate container padding on mount
  useEffect(() => {
    const savedHeight = localStorage.getItem('pastemax-instructions-height');
    const savedWidth = localStorage.getItem('pastemax-instructions-width');
    const savedContainerHeight = localStorage.getItem('pastemax-instructions-container-height');

    let initialHeight = 126;
    if (savedHeight) {
      initialHeight = parseInt(savedHeight, 10);
      setInstructionsHeight(initialHeight);
    }

    if (savedWidth) {
      setInstructionsWidth(parseInt(savedWidth, 10));
    }

    // Calculate container vertical padding
    if (containerRef.current) {
      const styles = getComputedStyle(containerRef.current);
      const paddingTop = parseFloat(styles.paddingTop) || 0;
      const paddingBottom = parseFloat(styles.paddingBottom) || 0;
      const vPad = paddingTop + paddingBottom;
      setContainerVPadding(vPad);

      // Set initial container height
      if (savedContainerHeight) {
        setContainerHeight(parseInt(savedContainerHeight, 10));
        setInstructionsHeight(parseInt(savedContainerHeight, 10) - vPad);
      } else {
        setContainerHeight(initialHeight + vPad);
      }
    }
  }, []);

  return (
    <>
      {/* Section header */}
      <div className="content-header">
        <div className="content-title">User Instructions</div>
        <div className="content-header-actions-group">
          <button
            type="button"
            className="text-button"
            onClick={handleClearInstructions}
            title="Clear instructions"
            aria-label="Clear instructions"
          >
            <Eraser size={14} />
            Clear
          </button>
        </div>
      </div>

      {/* Instructions input container */}
      <div
        className="user-instructions-container"
        ref={containerRef}
        style={containerHeight !== null ? { height: `${containerHeight}px` } : undefined}
      >
        <div
          className="user-instructions"
          style={{
            width: `${instructionsWidth}%`,
            height: `${instructionsHeight}px`,
          }}
        >
          <textarea
            id="userInstructionsInput"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Enter your instructions here..."
            style={{
              height: '100%',
            }}
          />

          {/* Resize handles */}
          <div
            className="instructions-resize-handle-vertical"
            onMouseDown={handleVerticalResizeStart}
            title="Drag to resize vertically"
          ></div>

          <div
            className="instructions-resize-handle-horizontal"
            onMouseDown={handleHorizontalResizeStart}
            title="Drag to resize horizontally"
          ></div>

          <div
            className="instructions-resize-handle-corner"
            onMouseDown={handleCornerResizeStart}
            title="Drag to resize"
          ></div>
        </div>
      </div>
    </>
  );
};

export default UserInstructions;
