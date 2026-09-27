import React from "react";
/***
 *
 *   FILE UPLOADER
 *   Drag & drop file upload component
 *   Can upload multiple files
 *   Includes fallback for older browser
 *
 *   PROPS
 *   name: input name
 *   max: max number of files
 *   maxFileSize: limit size of file in mb§
 *   accept: array of filetypes to accept, eg. ['jpg', 'gif']
 *
 **********/

import { useState, useRef } from "react";
import { Icon, Button, ClassHelper } from "components/lib";
import { Label } from "../label/label";
import { Error } from "../error/error";
import Style from "./file.tailwind";

export function FileInput(props) {
  const fileInputRef = useRef(undefined);
  const [dragging, setDragging] = useState<any>(false); // TODO: Type this // TODO: Type this
  const [valid, setValid] = useState<any>(undefined); // TODO: Type this // TODO: Type this
  const [error, setError] = useState<any>(
    props.errorMessage || "Please select a file",
  ); // TODO: Type this // TODO: Type this

  function validate(files) {
    const fileStore = [];

    // check for max files
    if (files.length + (props.value?.length || 0) > props.max) {
      setValid(false);
      setError(`Maximum of ${props.max} file`);
      return false;
    } else {
      // check files exist
      if (files.length) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const type = file.type
            .substring(file.type.indexOf("/") + 1)
            .toString();

          // validate file type
          if (props.accept?.length && !props.accept.includes(type)) {
            setValid(false);
            setError(
              "." +
                file.type.substring(file.type.indexOf("/") + 1) +
                " files are not allowed",
            );
          }

          // validate file size (in mb)
          else if (
            props.maxFileSize &&
            file.size > 1048576 * props.maxFileSize
          ) {
            setValid(false);
            setError(`Max filesize: ${props.maxFileSize}mb`);
          } else {
            // store the file in form store
            setValid(true);
            fileStore.push({
              name: file.name,
              data: file,
              url: URL.createObjectURL(file),
              size: file.size,
              type: file.type,
            });
          }
        }

        props.onChange(props.name, fileStore, valid);
      }
    }
  }

  function deleteFile(file) {
    fileInputRef.current.value = "";

    props.onChange(
      props.name,
      [
        {
          name: file.name,
          size: file.size,
          type: file.type,
        },
      ],
      true,
    );
  }

  function onDrag(e, state) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(state);
  }

  const fileStyle = ClassHelper(Style, {
    dropzone: true,
    dragging: dragging,
    error: valid === false ? true : false,
    success: props.value?.length && valid === true,
  });

  return (
    <div className={Style.file}>
      {props.label && (
        <Label text={props.label} required={props.required} for={props.name} />
      )}

      <div
        className={fileStyle}
        onClick={(e) => fileInputRef.current.click()}
        onDragOver={(e) => onDrag(e, true)}
        onDragEnter={(e) => onDrag(e, true)}
        onDragLeave={(e) => onDrag(e, false)}
        onDrop={(e) => {
          onDrag(e, false);
          validate(e.dataTransfer.files);
        }}
      >
        {/* fallback for old browsers */}
        <input
          type="file"
          className={Style.legacyInput}
          // @ts-ignore TODO: Check this
          files={props.value}
          ref={fileInputRef}
          onChange={(e) => {
            validate(fileInputRef.current.files);
          }}
        />

        <div className={Style.label}>
          <Icon
            image={props.value?.length ? "check" : "upload"}
            className={Style.labelIcon}
          />

          {props.value?.length ? (
            <FileList files={props.value} delete={deleteFile} />
          ) : (
            <div className={Style.labelText}>Drop file here</div>
          )}
        </div>
      </div>

      {valid === false && <Error message={error} />}
    </div>
  );
}

function FileList(props) {
  if (!props.files?.length) return false;

  return (
    <div>
      {props.files.map((file) => {
        return (
          <div key={file.name} className={Style.fileListItem}>
            <span>{file.name}</span>

            <Button
              icon="x"
              color="#d95565"
              size={13}
              className={Style.fileListButton}
              action={(e) => props.delete(file)}
            />
          </div>
        );
      })}
    </div>
  );
}
