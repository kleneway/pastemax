import React from "react";

interface UserInstructionsProps {
  instructions: string;
  setInstructions: (value: string) => void;
}

const UserInstructions = ({
  instructions,
  setInstructions,
}: UserInstructionsProps): JSX.Element => {
  return (
    <>
      <div className="user-instructions-header">
        <label className="content-title" htmlFor="userInstructionsInput">
          User Instructions
        </label>
      </div>
      <div className="user-instructions-container">
        <div className="user-instructions">
          <textarea
            id="userInstructionsInput"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Enter your instructions here..."
            rows={4}
            style={{
              width: "100%",
              resize: "none",
            }}
          />
        </div>
      </div>
    </>
  );
};

export default UserInstructions;
