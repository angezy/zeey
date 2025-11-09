
function validateSection($section) {
    let isValid = true;
    $section.find('input[required], select[required]').each(function () {
      if (!$(this).val()) {
        isValid = false;
        $(this).addClass('is-invalid'); // Add a class for invalid fields (optional for styling)
      } else {
        $(this).removeClass('is-invalid'); // Remove invalid class if corrected
      }
    });
    return isValid;
  };
function handlePageLoad() {
  const urlParams = new URLSearchParams(window.location.search);

  // Handle validation errors
  const errors = urlParams.get('errors');
  if (errors) {
    try {
      // Parse the JSON string to get error messages
      const errorMessages = JSON.parse(decodeURIComponent(errors));

      // Combine all errors into a single string with each error on a new line
      const errorText = errorMessages.map(msg => `• ${msg}`).join("\n");

      // Display using SweetAlert2
      Swal.fire({
        title: "Please try again!",
        text: errorText,
        icon: "error",
        confirmButtonText: "OK",
      });
    } catch (e) {
      console.error('Error parsing validation errors:', e);
    }
  }

  // Handle success message
  const success = urlParams.get('success');
  if (success) {
    Swal.fire({
      title: "Success!",
      text: success,
      icon: "success",
      confirmButtonText: "OK",
    });
  }

};
window.onload = handlePageLoad;
