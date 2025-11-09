document.addEventListener('DOMContentLoaded', function () {
  const otherRoleInputContainer = document.getElementById('otherRoleInputContainer');
  const otherRoleRadio = document.getElementById('otherRole');

  otherRoleRadio.addEventListener('change', function () {
      if (this.checked) {
          otherRoleInputContainer.style.display = 'block';
      }
  });

  // Hide the specific role input if another role is selected
  const roleRadios = document.querySelectorAll('input[name="Role"]');
  roleRadios.forEach(radio => {
      radio.addEventListener('change', function () {
          if (this.value !== 'specific Role:') {
              otherRoleInputContainer.style.display = 'none';
          }
      });
  });
});



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
  

  // Additional JavaScript for Contacts Form

function toggleOtherQuicklyInput() {
  const otherQuicklyRadio = document.getElementById('otherRole');
  const otherInputContainer = document.getElementById('otherRoleInputContainer');
  const otherInput = document.getElementById('specificRole');

  if (otherQuicklyRadio.checked) {
      otherInputContainer.style.display = 'block';
      otherInput.setAttribute('required', 'required'); // Make the input field required
  } else {
      otherInputContainer.style.display = 'none';
      otherInput.removeAttribute('required'); // Remove the required attribute
      otherInput.value = ''; // Optionally clear the input field
  }
}

// Attach the toggle function to the radio button change event
// Attach event listeners to all radio buttons in the "Quickly" group
document.querySelectorAll('input[name="Role"]').forEach((radio) => {
  radio.addEventListener('change', toggleOtherQuicklyInput);
});