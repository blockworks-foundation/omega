#!/bin/bash

cli_dir="$(dirname "$0")"
image_dir="$(dirname "$1")"
filename="$(basename "$1")"

yes_image="$1"
no_image="$(dirname "$yes_image")/${filename%.*}_no.${filename##*.}"
overlay_image="$cli_dir/../ui/design/cross.png"
size=$(convert $yes_image -format "%wx%h" info:)
echo "cli > $cli_dir"
echo "yes > $yes_image"
echo "no > $no_image"
echo "overlay > $overlay_image"
echo "size > $size"

composite $overlay_image $yes_image -geometry $size $no_image
