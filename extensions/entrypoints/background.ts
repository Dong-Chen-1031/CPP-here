export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });

  browser.action.onClicked.addListener(() => {
    console.log("Extension icon clicked on tab:", { id: browser.runtime.id });
  });
});
